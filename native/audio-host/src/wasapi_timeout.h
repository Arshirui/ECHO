#pragma once

#ifdef _WIN32

#include "audio_host_exit_codes.h"

#include <windows.h>
#include <audioclient.h>

#include <chrono>
#include <future>
#include <mutex>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <thread>
#include <vector>

namespace echo_wasapi_timeout {

constexpr int kWasapiInitTimeoutMs = 3000;

static std::vector<std::future<HRESULT>>& init_future_graveyard() {
    static auto* graveyard = new std::vector<std::future<HRESULT>>();
    return *graveyard;
}

static std::mutex& init_future_graveyard_mutex() {
    static auto* mutex = new std::mutex();
    return *mutex;
}

static void abandon_future(std::future<HRESULT>&& future) {
    std::lock_guard<std::mutex> lock(init_future_graveyard_mutex());
    init_future_graveyard().push_back(std::move(future));
}

static DWORD read_test_hang_ms(const char* name) {
    char value[32];
    DWORD length = GetEnvironmentVariableA(name, value, (DWORD)sizeof(value));
    if (length == 0 || length >= (DWORD)sizeof(value)) return 0;

    char* end = NULL;
    unsigned long parsed = strtoul(value, &end, 10);
    if (end == value || parsed == 0 || parsed > 60000UL) return 0;
    return (DWORD)parsed;
}

static std::vector<unsigned char> copy_wave_format(const WAVEFORMATEX* format) {
    std::vector<unsigned char> copy;
    if (format == NULL) return copy;

    const size_t formatSize = sizeof(WAVEFORMATEX) + (size_t)format->cbSize;
    copy.resize(formatSize);
    memcpy(copy.data(), format, formatSize);
    return copy;
}

static HRESULT initialize_with_timeout(
    IAudioClient* client,
    AUDCLNT_SHAREMODE shareMode,
    DWORD streamFlags,
    REFERENCE_TIME hnsBufferDuration,
    REFERENCE_TIME hnsPeriodicity,
    const WAVEFORMATEX* format,
    LPCGUID audioSessionGuid) {
    if (client == NULL) return E_POINTER;

    const std::vector<unsigned char> formatCopy = copy_wave_format(format);
    const bool hasSessionGuid = audioSessionGuid != NULL;
    const GUID sessionGuid = hasSessionGuid ? *audioSessionGuid : GUID {};
    const DWORD testHangMs = read_test_hang_ms("ECHO_TEST_WASAPI_INITIALIZE_HANG_MS");

    auto future = std::async(
        std::launch::async,
        [client,
         shareMode,
         streamFlags,
         hnsBufferDuration,
         hnsPeriodicity,
         formatCopy,
         hasSessionGuid,
         sessionGuid,
         testHangMs]() -> HRESULT {
            if (testHangMs > 0) {
                std::this_thread::sleep_for(std::chrono::milliseconds(testHangMs));
                return S_OK;
            }

            const WAVEFORMATEX* copiedFormat = formatCopy.empty()
                ? NULL
                : reinterpret_cast<const WAVEFORMATEX*>(formatCopy.data());
            LPCGUID copiedSessionGuid = hasSessionGuid ? &sessionGuid : NULL;
            return client->Initialize(
                shareMode,
                streamFlags,
                hnsBufferDuration,
                hnsPeriodicity,
                copiedFormat,
                copiedSessionGuid);
        });

    auto status = future.wait_for(std::chrono::milliseconds(kWasapiInitTimeoutMs));
    if (status == std::future_status::timeout) {
        fprintf(
            stderr,
            "[echo-audio-host] WASAPI Initialize timed out after %dms phase=initialize\n",
            kWasapiInitTimeoutMs);
        abandon_future(std::move(future));
        return E_PENDING;
    }

    return future.get();
}

static HRESULT start_with_timeout(IAudioClient* client) {
    if (client == NULL) return E_POINTER;

    const DWORD testHangMs = read_test_hang_ms("ECHO_TEST_WASAPI_START_HANG_MS");
    auto future = std::async(std::launch::async, [client, testHangMs]() -> HRESULT {
        if (testHangMs > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(testHangMs));
            return S_OK;
        }

        return client->Start();
    });

    auto status = future.wait_for(std::chrono::milliseconds(kWasapiInitTimeoutMs));
    if (status == std::future_status::timeout) {
        fprintf(
            stderr,
            "[echo-audio-host] WASAPI Start timed out after %dms phase=start\n",
            kWasapiInitTimeoutMs);
        abandon_future(std::move(future));
        return E_PENDING;
    }

    return future.get();
}

} // namespace echo_wasapi_timeout

#endif
