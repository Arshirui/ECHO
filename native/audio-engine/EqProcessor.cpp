#include "EqProcessor.h"

#include <algorithm>
#include <cmath>

namespace echo
{
namespace
{
float dbToGain(float db)
{
    return std::pow(10.0f, db / 20.0f);
}

float moveTowards(float current, float target, float step)
{
    if (std::abs(target - current) <= std::abs(step))
        return target;

    return current + (target > current ? std::abs(step) : -std::abs(step));
}
} // namespace

EqProcessor::EqProcessor()
{
    for (int band = 0; band < eqBandCount; ++band)
    {
        atomicBandGainsDb[static_cast<size_t>(band)].store(0.0f, std::memory_order_relaxed);
        atomicBandFrequenciesHz[static_cast<size_t>(band)].store(eqFrequenciesHz[static_cast<size_t>(band)], std::memory_order_relaxed);
    }
}

void EqProcessor::prepare(double sampleRate, int maximumBlockSize, int channelCount)
{
    currentSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    preparedChannels = std::max(1, channelCount);
    preparedBlockSize = std::max(1, maximumBlockSize);
    channelStates.resize(static_cast<size_t>(preparedChannels));
    updateSmoothingSteps();
    reset();
}

void EqProcessor::reset()
{
    for (auto& channel : channelStates)
        for (auto& filter : channel.filters)
            filter.reset();

    updateTargetSnapshot();
    smoothedPreampDb = targetPreampDb;
    bypassMix = targetEnabled.load(std::memory_order_acquire) ? 1.0f : 0.0f;
    targetBypassMix = bypassMix;
    targetBandGains = {};
    smoothedBandGains = {};
    targetBandFrequencies = eqFrequenciesHz;
    smoothedBandFrequencies = eqFrequenciesHz;

    for (int band = 0; band < eqBandCount; ++band)
    {
        targetBandGains[band] = atomicBandGainsDb[band].load(std::memory_order_acquire);
        smoothedBandGains[band] = targetBandGains[band];
        targetBandFrequencies[band] = atomicBandFrequenciesHz[band].load(std::memory_order_acquire);
        smoothedBandFrequencies[band] = targetBandFrequencies[band];
        coefficients[band] = makePeakingCoefficients(
            currentSampleRate,
            smoothedBandFrequencies[band],
            smoothedBandGains[band],
            1.0f);
    }
}

void EqProcessor::processBlock(juce::AudioBuffer<float>& buffer, int startSample, int numSamples)
{
    if (numSamples <= 0)
        return;

    updateTargetSnapshot();

    const int channelCount = std::min(buffer.getNumChannels(), preparedChannels);
    bool risk = false;

    for (int sample = 0; sample < numSamples; ++sample)
    {
        smoothedPreampDb = moveTowards(smoothedPreampDb, targetPreampDb, preampStepDb);
        bypassMix = moveTowards(bypassMix, targetBypassMix, bypassStep);

        for (int band = 0; band < eqBandCount; ++band)
        {
            smoothedBandGains[band] = moveTowards(smoothedBandGains[band], targetBandGains[band], bandGainSteps[band]);
            smoothedBandFrequencies[band] = moveTowards(smoothedBandFrequencies[band], targetBandFrequencies[band], bandFrequencySteps[band]);
            coefficients[band] = makePeakingCoefficients(
                currentSampleRate,
                smoothedBandFrequencies[band],
                smoothedBandGains[band],
                1.0f);
        }

        const float preampGain = dbToGain(smoothedPreampDb);

        for (int channel = 0; channel < channelCount; ++channel)
        {
            auto* samples = buffer.getWritePointer(channel, startSample);
            const float dry = samples[sample];
            float wet = dry * preampGain;

            for (int band = 0; band < eqBandCount; ++band)
                wet = channelStates[static_cast<size_t>(channel)].filters[band].process(wet, coefficients[band]);

            const float mixed = dry + (wet - dry) * bypassMix;
            samples[sample] = std::isfinite(mixed) ? mixed : 0.0f;

            if (std::abs(samples[sample]) > 0.98f)
                risk = true;
        }
    }

    clippingRisk.store(risk, std::memory_order_release);
    wasEnabled = targetBypassMix > 0.5f;
}

void EqProcessor::setEnabled(bool shouldBeEnabled)
{
    targetEnabled.store(shouldBeEnabled, std::memory_order_release);
}

void EqProcessor::setPreampDb(float value)
{
    atomicPreampDb.store(clampEqPreampDb(value), std::memory_order_release);
}

bool EqProcessor::setBandGainDb(int bandIndex, float value)
{
    if (bandIndex < 0 || bandIndex >= eqBandCount)
        return false;

    atomicBandGainsDb[static_cast<size_t>(bandIndex)].store(clampEqGainDb(value), std::memory_order_release);
    return true;
}

bool EqProcessor::setBandFrequencyHz(int bandIndex, float value)
{
    if (bandIndex < 0 || bandIndex >= eqBandCount || ! std::isfinite(value))
        return false;

    atomicBandFrequenciesHz[static_cast<size_t>(bandIndex)].store(clampEqFrequencyHz(value), std::memory_order_release);
    return true;
}

void EqProcessor::resetFlat()
{
    setPreampDb(0.0f);

    for (int band = 0; band < eqBandCount; ++band)
    {
        setBandGainDb(band, 0.0f);
        setBandFrequencyHz(band, eqFrequenciesHz[static_cast<size_t>(band)]);
    }
}

void EqProcessor::setState(const EqState& state)
{
    setEnabled(state.enabled);
    setPreampDb(state.preampDb);

    for (int band = 0; band < eqBandCount; ++band)
    {
        setBandGainDb(band, state.bandGainsDb[static_cast<size_t>(band)]);
        setBandFrequencyHz(band, state.bandFrequenciesHz[static_cast<size_t>(band)]);
    }
}

EqState EqProcessor::getState() const
{
    EqState state;
    state.enabled = targetEnabled.load(std::memory_order_acquire);
    state.preampDb = atomicPreampDb.load(std::memory_order_acquire);

    for (int band = 0; band < eqBandCount; ++band)
    {
        state.bandGainsDb[static_cast<size_t>(band)] = atomicBandGainsDb[static_cast<size_t>(band)].load(std::memory_order_acquire);
        state.bandFrequenciesHz[static_cast<size_t>(band)] = atomicBandFrequenciesHz[static_cast<size_t>(band)].load(std::memory_order_acquire);
    }

    return state;
}

bool EqProcessor::isEnabled() const
{
    return targetEnabled.load(std::memory_order_acquire);
}

bool EqProcessor::hasClippingRisk() const
{
    return clippingRisk.load(std::memory_order_acquire);
}

void EqProcessor::updateSmoothingSteps()
{
    gainSmoothingSamples = std::max(1, static_cast<int>(currentSampleRate * 0.025));
    bypassSmoothingSamples = std::max(1, static_cast<int>(currentSampleRate * 0.015));
}

void EqProcessor::updateTargetSnapshot()
{
    targetPreampDb = atomicPreampDb.load(std::memory_order_acquire);
    preampStepDb = (targetPreampDb - smoothedPreampDb) / static_cast<float>(gainSmoothingSamples);
    targetBypassMix = targetEnabled.load(std::memory_order_acquire) ? 1.0f : 0.0f;
    bypassStep = (targetBypassMix - bypassMix) / static_cast<float>(bypassSmoothingSamples);

    for (int band = 0; band < eqBandCount; ++band)
    {
        targetBandGains[static_cast<size_t>(band)] = atomicBandGainsDb[static_cast<size_t>(band)].load(std::memory_order_acquire);
        bandGainSteps[static_cast<size_t>(band)] =
            (targetBandGains[static_cast<size_t>(band)] - smoothedBandGains[static_cast<size_t>(band)])
            / static_cast<float>(gainSmoothingSamples);
        targetBandFrequencies[static_cast<size_t>(band)] = atomicBandFrequenciesHz[static_cast<size_t>(band)].load(std::memory_order_acquire);
        bandFrequencySteps[static_cast<size_t>(band)] =
            (targetBandFrequencies[static_cast<size_t>(band)] - smoothedBandFrequencies[static_cast<size_t>(band)])
            / static_cast<float>(gainSmoothingSamples);
    }
}
} // namespace echo
