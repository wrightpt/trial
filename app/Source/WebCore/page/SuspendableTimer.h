/*
 * Copyright (C) 2008, 2013 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

#pragma once

#include "ActiveDOMObject.h"
#include "Timer.h"

#include <wtf/Seconds.h>

namespace WebCore {

class SuspendableTimer : private TimerBase, public ActiveDOMObject {
public:
    explicit SuspendableTimer(ScriptExecutionContext&);
    virtual ~SuspendableTimer();

    // A hook for derived classes to perform cleanup.
    virtual void didStop();

    // Part of TimerBase interface used by SuspendableTimer clients, modified to work when suspended.
    bool isActive() const { return TimerBase::isActive() || (m_suspended && m_savedIsActive); }
    bool isSuspended() const { return m_suspended; }

    void startRepeating(double repeatInterval);
    void startOneShot(double interval);
    double repeatInterval() const;
    void augmentFireInterval(double delta);
    void augmentRepeatInterval(double delta);

    void startRepeating(Seconds repeatInterval) { startRepeating(repeatInterval.value()); }
    void startOneShot(Seconds interval) { startOneShot(interval.value()); }

    // FIXME: Use the overloads taking Seconds instead and drop these.
    void startRepeating(std::chrono::milliseconds repeatInterval) { startRepeating(msToSeconds(repeatInterval)); }
    void startOneShot(std::chrono::milliseconds interval) { startOneShot(msToSeconds(interval)); }

    std::chrono::milliseconds repeatIntervalMS() const { return secondsToMS(repeatInterval()); }
    Seconds repeatIntervalSeconds() const { return Seconds { repeatInterval() }; }

    void augmentFireInterval(Seconds delta) { augmentFireInterval(delta.value()); }
    void augmentRepeatInterval(Seconds delta) { augmentRepeatInterval(delta.value()); }

    // FIXME: Use the overloads taking Seconds instead and drop these.
    void augmentFireInterval(std::chrono::milliseconds delta) { augmentFireInterval(msToSeconds(delta)); }
    void augmentRepeatInterval(std::chrono::milliseconds delta) { augmentRepeatInterval(msToSeconds(delta)); }

    using TimerBase::didChangeAlignmentInterval;
    using TimerBase::operator new;
    using TimerBase::operator delete;

    void cancel(); // Equivalent to TimerBase::stop(), whose name conflicts with ActiveDOMObject::stop().

private:
    void fired() override = 0;

    // ActiveDOMObject API.
    bool hasPendingActivity() const final;
    void stop() final;
    bool canSuspendForDocumentSuspension() const final;
    void suspend(ReasonForSuspension) final;
    void resume() final;

    bool m_suspended;

    double m_savedNextFireInterval;
    double m_savedRepeatInterval;
    bool m_savedIsActive;
};

} // namespace WebCore
