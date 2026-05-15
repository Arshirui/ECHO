#ifdef _WIN32

#include "wasapi_shared.h"

#include <windows.h>
#include <audioclient.h>
#include <avrt.h>
#include <mmdeviceapi.h>
#include <propidl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <vector>

static const GUID ECHO_SUBTYPE_PCM = {
    0x00000001, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}
};

static const GUID ECHO_SUBTYPE_IEEE_FLOAT = {
    0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}
};

typedef enum wasapi_shared_sample_format {
    WASAPI_SHARED_FORMAT_FLOAT32 = 0,
    WASAPI_SHARED_FORMAT_PCM24_IN_32,
    WASAPI_SHARED_FORMAT_PCM32,
    WASAPI_SHARED_FORMAT_PCM24,
    WASAPI_SHARED_FORMAT_PCM16
} wasapi_shared_sample_format;

typedef struct wasapi_shared_format_desc {
    WAVEFORMATEXTENSIBLE wave;
    wasapi_shared_sample_format kind;
    const char* name;
} wasapi_shared_format_desc;

struct wasapi_shared_runtime {
    IAudioClient* audioClient;
    IAudioRenderClient* renderClient;
    HANDLE renderEvent;
    HANDLE stopEvent;
    HANDLE thread;
    uint32_t sampleRate;
    uint32_t channels;
    uint32_t bufferFrameCount;
    uint32_t bytesPerFrame;
    wasapi_shared_format_desc format;
    wasapi_render_callback callback;
    void* userData;
    volatile LONG renderFailed;
    int comNeedsUninit;
};

typedef struct com_scope {
    HRESULT hr;
    int needsUninit;
} com_scope;

static com_scope com_scope_enter(void) {
    com_scope scope;
    scope.hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    scope.needsUninit = SUCCEEDED(scope.hr);
    if (scope.hr == RPC_E_CHANGED_MODE) {
        scope.hr = S_OK;
        scope.needsUninit = 0;
    }
    return scope;
}

static void com_scope_leave(com_scope* scope) {
    if (scope != NULL && scope->needsUninit) {
        CoUninitialize();
        scope->needsUninit = 0;
    }
}

static void set_error(char* error, size_t errorLen, const char* message, HRESULT hr) {
    if (error == NULL || errorLen == 0) return;
    if (message == NULL) message = "unknown error";
    if (hr != S_OK) {
        snprintf(error, errorLen, "%s (hr=0x%08lx)", message, (unsigned long)hr);
    } else {
        snprintf(error, errorLen, "%s", message);
    }
    error[errorLen - 1] = '\0';
}

static void wide_to_utf8(const wchar_t* wide, char* out, int outLen) {
    if (out == NULL || outLen <= 0) return;
    out[0] = '\0';
    if (wide == NULL || wide[0] == L'\0') return;
    if (WideCharToMultiByte(CP_UTF8, 0, wide, -1, out, outLen, NULL, NULL) <= 0) {
        out[0] = '\0';
    }
}

static wchar_t* utf8_to_wide_alloc(const char* utf8) {
    if (utf8 == NULL || utf8[0] == '\0') return NULL;
    int len = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, NULL, 0);
    if (len <= 0) return NULL;
    wchar_t* out = (wchar_t*)calloc((size_t)len, sizeof(wchar_t));
    if (out == NULL) return NULL;
    if (MultiByteToWideChar(CP_UTF8, 0, utf8, -1, out, len) <= 0) {
        free(out);
        return NULL;
    }
    return out;
}

static int wide_contains_icase(const wchar_t* haystack, const wchar_t* needle) {
    if (haystack == NULL || needle == NULL || needle[0] == L'\0') return 0;
    size_t hayLen = wcslen(haystack);
    size_t needleLen = wcslen(needle);
    if (needleLen > hayLen) return 0;
    for (size_t i = 0; i <= hayLen - needleLen; ++i) {
        if (_wcsnicmp(haystack + i, needle, needleLen) == 0) return 1;
    }
    return 0;
}

static HRESULT activate_audio_client(IMMDevice* device, IAudioClient** outClient) {
    if (outClient == NULL) return E_POINTER;
    *outClient = NULL;
    if (device == NULL) return E_POINTER;
    return device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void**)outClient);
}

static HRESULT get_device_name(IMMDevice* device, char* utf8Name, size_t utf8NameLen) {
    static const PROPERTYKEY friendlyNameKey = {
        {0xa45c254e, 0xdf1c, 0x4efd, {0x80, 0x20, 0x67, 0xd1, 0x46, 0xa8, 0x50, 0xe0}},
        14
    };
    IPropertyStore* props = NULL;
    PROPVARIANT value;
    HRESULT hr;

    if (utf8Name != NULL && utf8NameLen > 0) utf8Name[0] = '\0';
    if (device == NULL || utf8Name == NULL || utf8NameLen == 0) return E_POINTER;

    PropVariantInit(&value);
    hr = device->OpenPropertyStore(STGM_READ, &props);
    if (FAILED(hr)) goto done;
    hr = props->GetValue(friendlyNameKey, &value);
    if (FAILED(hr)) goto done;
    if (value.vt != VT_LPWSTR || value.pwszVal == NULL) {
        hr = E_FAIL;
        goto done;
    }

    wide_to_utf8(value.pwszVal, utf8Name, (int)utf8NameLen);
    hr = S_OK;

done:
    PropVariantClear(&value);
    if (props != NULL) props->Release();
    return hr;
}

static bool is_guid_equal(const GUID& left, const GUID& right) {
    return IsEqualGUID(left, right) != 0;
}

static int describe_mix_format(const WAVEFORMATEX* mixFormat, wasapi_shared_format_desc* out) {
    if (mixFormat == NULL || out == NULL) return 0;
    if (mixFormat->nChannels == 0 || mixFormat->nChannels > 8) return 0;
    if (mixFormat->nBlockAlign == 0 || mixFormat->nSamplesPerSec == 0) return 0;

    memset(out, 0, sizeof(*out));

    const WORD tag = mixFormat->wFormatTag;
    WORD containerBits = mixFormat->wBitsPerSample;
    WORD validBits = mixFormat->wBitsPerSample;
    GUID subFormat = ECHO_SUBTYPE_PCM;

    if (tag == WAVE_FORMAT_EXTENSIBLE) {
        const WAVEFORMATEXTENSIBLE* extensible = (const WAVEFORMATEXTENSIBLE*)mixFormat;
        containerBits = extensible->Format.wBitsPerSample;
        validBits = extensible->Samples.wValidBitsPerSample != 0
            ? extensible->Samples.wValidBitsPerSample
            : extensible->Format.wBitsPerSample;
        subFormat = extensible->SubFormat;
        memcpy(&out->wave, extensible, sizeof(WAVEFORMATEXTENSIBLE));
    } else {
        out->wave.Format = *mixFormat;
        out->wave.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
        out->wave.Format.cbSize = (WORD)(sizeof(WAVEFORMATEXTENSIBLE) - sizeof(WAVEFORMATEX));
        out->wave.Samples.wValidBitsPerSample = validBits;
        out->wave.dwChannelMask = mixFormat->nChannels == 1
            ? SPEAKER_FRONT_CENTER
            : (mixFormat->nChannels == 2 ? (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT) : 0);
        out->wave.SubFormat = tag == WAVE_FORMAT_IEEE_FLOAT ? ECHO_SUBTYPE_IEEE_FLOAT : ECHO_SUBTYPE_PCM;
        subFormat = out->wave.SubFormat;
    }

    if (is_guid_equal(subFormat, ECHO_SUBTYPE_IEEE_FLOAT) && containerBits == 32) {
        out->kind = WASAPI_SHARED_FORMAT_FLOAT32;
        out->name = "float32";
        return 1;
    }

    if (! is_guid_equal(subFormat, ECHO_SUBTYPE_PCM)) return 0;

    if (containerBits == 32 && validBits == 24) {
        out->kind = WASAPI_SHARED_FORMAT_PCM24_IN_32;
        out->name = "pcm24in32";
        return 1;
    }

    if (containerBits == 32 && validBits == 32) {
        out->kind = WASAPI_SHARED_FORMAT_PCM32;
        out->name = "pcm32";
        return 1;
    }

    if (containerBits == 24 && validBits == 24) {
        out->kind = WASAPI_SHARED_FORMAT_PCM24;
        out->name = "pcm24";
        return 1;
    }

    if (containerBits == 16 && validBits == 16) {
        out->kind = WASAPI_SHARED_FORMAT_PCM16;
        out->name = "pcm16";
        return 1;
    }

    return 0;
}

static uint32_t shared_mix_rate(IMMDevice* device) {
    IAudioClient* audioClient = NULL;
    WAVEFORMATEX* mixFormat = NULL;
    uint32_t sampleRate = 0;

    if (FAILED(activate_audio_client(device, &audioClient))) return 0;
    if (SUCCEEDED(audioClient->GetMixFormat(&mixFormat)) && mixFormat != NULL) {
        sampleRate = mixFormat->nSamplesPerSec;
    }

    if (mixFormat != NULL) CoTaskMemFree(mixFormat);
    audioClient->Release();
    return sampleRate;
}

static uint32_t shared_mix_channels(IMMDevice* device) {
    IAudioClient* audioClient = NULL;
    WAVEFORMATEX* mixFormat = NULL;
    uint32_t channels = 0;

    if (FAILED(activate_audio_client(device, &audioClient))) return 0;
    if (SUCCEEDED(audioClient->GetMixFormat(&mixFormat)) && mixFormat != NULL) {
        channels = mixFormat->nChannels;
    }

    if (mixFormat != NULL) CoTaskMemFree(mixFormat);
    audioClient->Release();
    return channels;
}

static int enumerate_devices(std::vector<wasapi_shared_device_info>& devices, char* error, size_t errorLen) {
    IMMDeviceEnumerator* enumerator = NULL;
    IMMDeviceCollection* collection = NULL;
    IMMDevice* defaultDevice = NULL;
    LPWSTR defaultId = NULL;
    UINT count = 0;
    HRESULT hr;

    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to create MMDeviceEnumerator", hr);
        return -1;
    }

    if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &defaultDevice))) {
        defaultDevice->GetId(&defaultId);
    }

    hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to enumerate render endpoints", hr);
        if (defaultId != NULL) CoTaskMemFree(defaultId);
        if (defaultDevice != NULL) defaultDevice->Release();
        enumerator->Release();
        return -1;
    }

    hr = collection->GetCount(&count);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to count render endpoints", hr);
        if (defaultId != NULL) CoTaskMemFree(defaultId);
        if (defaultDevice != NULL) defaultDevice->Release();
        collection->Release();
        enumerator->Release();
        return -1;
    }

    for (UINT i = 0; i < count; ++i) {
        IMMDevice* device = NULL;
        LPWSTR id = NULL;
        wasapi_shared_device_info info;
        memset(&info, 0, sizeof(info));

        if (FAILED(collection->Item(i, &device)) || device == NULL) continue;
        if (FAILED(device->GetId(&id)) || id == NULL) {
            device->Release();
            continue;
        }

        wcsncpy(info.id, id, sizeof(info.id) / sizeof(info.id[0]) - 1);
        info.id[sizeof(info.id) / sizeof(info.id[0]) - 1] = L'\0';
        if (FAILED(get_device_name(device, info.name, sizeof(info.name))) || info.name[0] == '\0') {
            snprintf(info.name, sizeof(info.name), "WASAPI Device %u", (unsigned int)i);
        }
        info.sharedSampleRate = shared_mix_rate(device);
        info.channels = shared_mix_channels(device);
        info.isDefault = (defaultId != NULL && wcscmp(defaultId, id) == 0) ? 1 : 0;
        devices.push_back(info);

        CoTaskMemFree(id);
        device->Release();
    }

    if (defaultId != NULL) CoTaskMemFree(defaultId);
    if (defaultDevice != NULL) defaultDevice->Release();
    collection->Release();
    enumerator->Release();
    return 0;
}

int wasapi_shared_list_devices(wasapi_shared_device_info** outDevices, uint32_t* outCount) {
    if (outDevices == NULL || outCount == NULL) return -1;
    *outDevices = NULL;
    *outCount = 0;

    com_scope com = com_scope_enter();
    if (FAILED(com.hr)) return -1;

    std::vector<wasapi_shared_device_info> devices;
    int result = enumerate_devices(devices, NULL, 0);
    if (result == 0 && !devices.empty()) {
        wasapi_shared_device_info* copy = (wasapi_shared_device_info*)calloc(devices.size(), sizeof(wasapi_shared_device_info));
        if (copy == NULL) {
            result = -1;
        } else {
            memcpy(copy, devices.data(), devices.size() * sizeof(wasapi_shared_device_info));
            *outDevices = copy;
            *outCount = (uint32_t)devices.size();
        }
    }

    com_scope_leave(&com);
    return result;
}

void wasapi_shared_free_devices(wasapi_shared_device_info* devices) {
    free(devices);
}

static IMMDevice* resolve_device(
    const std::vector<wasapi_shared_device_info>& devices,
    const char* targetDeviceName,
    int targetDeviceIndex,
    char* error,
    size_t errorLen) {
    IMMDeviceEnumerator* enumerator = NULL;
    IMMDevice* device = NULL;
    const wchar_t* selectedId = NULL;
    HRESULT hr;

    if (targetDeviceIndex >= 0) {
        if ((size_t)targetDeviceIndex < devices.size()) {
            selectedId = devices[(size_t)targetDeviceIndex].id;
        } else {
            set_error(error, errorLen, "Invalid WASAPI shared device index", S_OK);
            return NULL;
        }
    } else if (targetDeviceName != NULL && targetDeviceName[0] != '\0') {
        wchar_t* wideName = utf8_to_wide_alloc(targetDeviceName);
        for (size_t i = 0; i < devices.size(); ++i) {
            wchar_t deviceName[512];
            MultiByteToWideChar(CP_UTF8, 0, devices[i].name, -1, deviceName, (int)(sizeof(deviceName) / sizeof(deviceName[0])));
            deviceName[sizeof(deviceName) / sizeof(deviceName[0]) - 1] = L'\0';
            if ((wideName != NULL && (wide_contains_icase(deviceName, wideName) || wide_contains_icase(wideName, deviceName))) ||
                strcmp(devices[i].name, targetDeviceName) == 0) {
                selectedId = devices[i].id;
                break;
            }
        }
        free(wideName);
    }

    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to create MMDeviceEnumerator", hr);
        return NULL;
    }

    if (selectedId != NULL) {
        hr = enumerator->GetDevice(selectedId, &device);
    } else {
        hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
    }

    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to resolve WASAPI shared endpoint", hr);
        device = NULL;
    }

    enumerator->Release();
    return device;
}

static REFERENCE_TIME frames_to_hns(uint32_t frames, uint32_t sampleRate) {
    if (sampleRate == 0) return 0;
    return (REFERENCE_TIME)((10000000.0 * (double)frames / (double)sampleRate) + 0.5);
}

static float clamp_sample(float sample) {
    if (sample > 1.0f) return 1.0f;
    if (sample < -1.0f) return -1.0f;
    return sample;
}

static void convert_float_to_endpoint(
    const float* input,
    BYTE* output,
    uint32_t frames,
    uint32_t channels,
    const wasapi_shared_format_desc* format) {
    uint32_t total = frames * channels;

    switch (format->kind) {
        case WASAPI_SHARED_FORMAT_FLOAT32:
            memcpy(output, input, (size_t)total * sizeof(float));
            break;
        case WASAPI_SHARED_FORMAT_PCM24_IN_32: {
            int32_t* dst = (int32_t*)output;
            for (uint32_t i = 0; i < total; ++i) {
                float s = clamp_sample(input[i]);
                int32_t v = (int32_t)(s * 8388607.0f);
                dst[i] = v << 8;
            }
            break;
        }
        case WASAPI_SHARED_FORMAT_PCM32: {
            int32_t* dst = (int32_t*)output;
            for (uint32_t i = 0; i < total; ++i) {
                float s = clamp_sample(input[i]);
                dst[i] = (int32_t)(s * 2147483647.0f);
            }
            break;
        }
        case WASAPI_SHARED_FORMAT_PCM24: {
            uint8_t* dst = (uint8_t*)output;
            for (uint32_t i = 0; i < total; ++i) {
                float s = clamp_sample(input[i]);
                int32_t v = (int32_t)(s * 8388607.0f);
                dst[i * 3 + 0] = (uint8_t)(v & 0xff);
                dst[i * 3 + 1] = (uint8_t)((v >> 8) & 0xff);
                dst[i * 3 + 2] = (uint8_t)((v >> 16) & 0xff);
            }
            break;
        }
        case WASAPI_SHARED_FORMAT_PCM16:
        default: {
            int16_t* dst = (int16_t*)output;
            for (uint32_t i = 0; i < total; ++i) {
                float s = clamp_sample(input[i]);
                dst[i] = (int16_t)(s * 32767.0f);
            }
            break;
        }
    }
}

static DWORD WINAPI render_thread_proc(void* param) {
    wasapi_shared_runtime* runtime = (wasapi_shared_runtime*)param;
    std::vector<float> scratch;
    DWORD taskIndex = 0;
    HANDLE avrtHandle = NULL;
    HANDLE waits[2];
    com_scope com = com_scope_enter();

    if (FAILED(com.hr)) {
        InterlockedExchange(&runtime->renderFailed, 1);
        return 1;
    }

    scratch.resize((size_t)runtime->bufferFrameCount * runtime->channels);
    avrtHandle = AvSetMmThreadCharacteristicsW(L"Pro Audio", &taskIndex);
    waits[0] = runtime->stopEvent;
    waits[1] = runtime->renderEvent;

    while (1) {
        DWORD waitResult = WaitForMultipleObjects(2, waits, FALSE, INFINITE);
        if (waitResult == WAIT_OBJECT_0) break;
        if (waitResult != WAIT_OBJECT_0 + 1) {
            InterlockedExchange(&runtime->renderFailed, 1);
            break;
        }

        UINT32 padding = 0;
        HRESULT hr = runtime->audioClient->GetCurrentPadding(&padding);
        if (FAILED(hr)) {
            fprintf(stderr, "[echo-audio-host] WASAPI shared GetCurrentPadding failed hr=0x%08lx\n", (unsigned long)hr);
            InterlockedExchange(&runtime->renderFailed, 1);
            break;
        }

        if (padding >= runtime->bufferFrameCount) continue;
        UINT32 framesAvailable = runtime->bufferFrameCount - padding;
        if (framesAvailable == 0) continue;

        BYTE* endpointBuffer = NULL;
        hr = runtime->renderClient->GetBuffer(framesAvailable, &endpointBuffer);
        if (FAILED(hr)) {
            fprintf(stderr, "[echo-audio-host] WASAPI shared GetBuffer failed hr=0x%08lx\n", (unsigned long)hr);
            InterlockedExchange(&runtime->renderFailed, 1);
            break;
        }

        memset(scratch.data(), 0, (size_t)framesAvailable * runtime->channels * sizeof(float));
        if (runtime->callback != NULL) {
            runtime->callback(runtime->userData, scratch.data(), framesAvailable, runtime->channels);
        }
        convert_float_to_endpoint(
            scratch.data(),
            endpointBuffer,
            framesAvailable,
            runtime->channels,
            &runtime->format);

        hr = runtime->renderClient->ReleaseBuffer(framesAvailable, 0);
        if (FAILED(hr)) {
            fprintf(stderr, "[echo-audio-host] WASAPI shared ReleaseBuffer failed hr=0x%08lx\n", (unsigned long)hr);
            InterlockedExchange(&runtime->renderFailed, 1);
            break;
        }
    }

    if (avrtHandle != NULL) AvRevertMmThreadCharacteristics(avrtHandle);
    com_scope_leave(&com);
    return InterlockedCompareExchange(&runtime->renderFailed, 0, 0) ? 1 : 0;
}

int wasapi_shared_start(
    const char* targetDeviceName,
    int targetDeviceIndex,
    uint32_t requestedSampleRate,
    uint32_t sourceChannels,
    uint32_t requestedBufferFrames,
    wasapi_render_callback callback,
    void* userData,
    wasapi_shared_runtime** outRuntime,
    wasapi_shared_ready_info* outInfo,
    char* error,
    size_t errorLen) {
    com_scope com = com_scope_enter();
    std::vector<wasapi_shared_device_info> devices;
    IMMDevice* device = NULL;
    IAudioClient* audioClient = NULL;
    IAudioRenderClient* renderClient = NULL;
    WAVEFORMATEX* mixFormat = NULL;
    WAVEFORMATEX* closestMatch = NULL;
    wasapi_shared_format_desc format;
    uint32_t bufferFrames = 0;
    wasapi_shared_runtime* runtime = NULL;
    BYTE* endpointBuffer = NULL;
    HRESULT hr;
    int result = -1;

    (void)sourceChannels;

    if (outRuntime == NULL || outInfo == NULL || callback == NULL) return -1;
    *outRuntime = NULL;
    memset(outInfo, 0, sizeof(*outInfo));
    if (error != NULL && errorLen > 0) error[0] = '\0';

    if (FAILED(com.hr)) {
        set_error(error, errorLen, "Failed to initialize COM", com.hr);
        return -1;
    }

    if (enumerate_devices(devices, error, errorLen) != 0 || devices.empty()) {
        com_scope_leave(&com);
        return -1;
    }

    device = resolve_device(devices, targetDeviceName, targetDeviceIndex, error, errorLen);
    if (device == NULL) {
        com_scope_leave(&com);
        return -1;
    }

    hr = activate_audio_client(device, &audioClient);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to activate IAudioClient", hr);
        goto done;
    }

    hr = audioClient->GetMixFormat(&mixFormat);
    if (FAILED(hr) || mixFormat == NULL) {
        set_error(error, errorLen, "Failed to get WASAPI shared mix format", hr);
        goto done;
    }

    if (! describe_mix_format(mixFormat, &format)) {
        set_error(error, errorLen, "Unsupported WASAPI shared mix format", S_OK);
        result = -4;
        goto done;
    }

    if (requestedSampleRate != 0 && requestedSampleRate != format.wave.Format.nSamplesPerSec) {
        fprintf(stderr,
            "[echo-audio-host] WASAPI shared using endpoint mix rate %u instead of requested %u\n",
            (unsigned int)format.wave.Format.nSamplesPerSec,
            (unsigned int)requestedSampleRate);
    }

    hr = audioClient->IsFormatSupported(AUDCLNT_SHAREMODE_SHARED, (WAVEFORMATEX*)&format.wave, &closestMatch);
    if (hr != S_OK) {
        set_error(error, errorLen, "WASAPI shared mix format unsupported", hr);
        result = -4;
        goto done;
    }

    REFERENCE_TIME bufferDuration = requestedBufferFrames > 0
        ? frames_to_hns(requestedBufferFrames, format.wave.Format.nSamplesPerSec)
        : 0;
    hr = audioClient->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_NOPERSIST,
        bufferDuration,
        0,
        (WAVEFORMATEX*)&format.wave,
        NULL);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to initialize WASAPI shared client", hr);
        goto done;
    }

    UINT32 rawBufferFrames = 0;
    hr = audioClient->GetBufferSize(&rawBufferFrames);
    if (FAILED(hr) || rawBufferFrames == 0) {
        set_error(error, errorLen, "Failed to get WASAPI shared buffer size", hr);
        goto done;
    }
    bufferFrames = rawBufferFrames;

    hr = audioClient->GetService(__uuidof(IAudioRenderClient), (void**)&renderClient);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to get IAudioRenderClient", hr);
        goto done;
    }

    runtime = (wasapi_shared_runtime*)calloc(1, sizeof(wasapi_shared_runtime));
    if (runtime == NULL) {
        set_error(error, errorLen, "Failed to allocate WASAPI shared runtime", S_OK);
        goto done;
    }

    runtime->audioClient = audioClient;
    runtime->renderClient = renderClient;
    runtime->sampleRate = format.wave.Format.nSamplesPerSec;
    runtime->channels = format.wave.Format.nChannels;
    runtime->bufferFrameCount = bufferFrames;
    runtime->bytesPerFrame = format.wave.Format.nBlockAlign;
    runtime->format = format;
    runtime->callback = callback;
    runtime->userData = userData;
    runtime->comNeedsUninit = com.needsUninit;
    com.needsUninit = 0;
    audioClient = NULL;
    renderClient = NULL;

    runtime->renderEvent = CreateEventW(NULL, FALSE, FALSE, NULL);
    runtime->stopEvent = CreateEventW(NULL, TRUE, FALSE, NULL);
    if (runtime->renderEvent == NULL || runtime->stopEvent == NULL) {
        set_error(error, errorLen, "Failed to create WASAPI shared events", HRESULT_FROM_WIN32(GetLastError()));
        goto done;
    }

    hr = runtime->audioClient->SetEventHandle(runtime->renderEvent);
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to set WASAPI shared event handle", hr);
        goto done;
    }

    UINT32 padding = 0;
    hr = runtime->audioClient->GetCurrentPadding(&padding);
    if (SUCCEEDED(hr) && padding < runtime->bufferFrameCount) {
        UINT32 framesAvailable = runtime->bufferFrameCount - padding;
        endpointBuffer = NULL;
        hr = runtime->renderClient->GetBuffer(framesAvailable, &endpointBuffer);
        if (SUCCEEDED(hr)) {
            memset(endpointBuffer, 0, (size_t)framesAvailable * runtime->bytesPerFrame);
            hr = runtime->renderClient->ReleaseBuffer(framesAvailable, AUDCLNT_BUFFERFLAGS_SILENT);
        }
    }
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to prime WASAPI shared buffer", hr);
        goto done;
    }

    runtime->thread = CreateThread(NULL, 0, render_thread_proc, runtime, 0, NULL);
    if (runtime->thread == NULL) {
        set_error(error, errorLen, "Failed to create WASAPI shared render thread", HRESULT_FROM_WIN32(GetLastError()));
        goto done;
    }

    hr = runtime->audioClient->Start();
    if (FAILED(hr)) {
        set_error(error, errorLen, "Failed to start WASAPI shared client", hr);
        goto done;
    }

    outInfo->sampleRate = runtime->sampleRate;
    outInfo->hardwareSampleRate = runtime->sampleRate;
    outInfo->channels = runtime->channels;
    outInfo->bufferFrameCount = runtime->bufferFrameCount;
    snprintf(outInfo->format, sizeof(outInfo->format), "%s", runtime->format.name);
    *outRuntime = runtime;
    runtime = NULL;
    result = 0;

done:
    if (closestMatch != NULL) CoTaskMemFree(closestMatch);
    if (mixFormat != NULL) CoTaskMemFree(mixFormat);
    if (runtime != NULL) {
        wasapi_shared_stop(runtime);
    }
    if (renderClient != NULL) renderClient->Release();
    if (audioClient != NULL) audioClient->Release();
    if (device != NULL) device->Release();
    com_scope_leave(&com);
    return result;
}

void wasapi_shared_stop(wasapi_shared_runtime* runtime) {
    if (runtime == NULL) return;

    if (runtime->stopEvent != NULL) SetEvent(runtime->stopEvent);
    if (runtime->thread != NULL) {
        DWORD waitResult = WaitForSingleObject(runtime->thread, 5000);
        if (waitResult != WAIT_OBJECT_0) {
            fprintf(stderr,
                "[echo-audio-host] WASAPI shared render thread did not stop in time; deferring resource release to process teardown\n");
            CloseHandle(runtime->thread);
            return;
        }
        CloseHandle(runtime->thread);
    }
    if (runtime->audioClient != NULL) runtime->audioClient->Stop();
    if (runtime->renderEvent != NULL) CloseHandle(runtime->renderEvent);
    if (runtime->stopEvent != NULL) CloseHandle(runtime->stopEvent);
    if (runtime->renderClient != NULL) runtime->renderClient->Release();
    if (runtime->audioClient != NULL) runtime->audioClient->Release();
    if (runtime->comNeedsUninit) CoUninitialize();
    free(runtime);
}

#endif
