/*
 * Copyright (C) 2016 Apple Inc. All rights reserved.
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
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

#pragma once

#if ENABLE(APPLE_PAY)

#include <wtf/EnumTraits.h>

namespace WebCore {

enum class PaymentAuthorizationStatus {
    Success,
    Failure,
    InvalidBillingPostalAddress,
    InvalidShippingPostalAddress,
    InvalidShippingContact,
    PINRequired,
    PINIncorrect,
    PINLockout,
};

static inline bool isFinalStateStatus(PaymentAuthorizationStatus status)
{
    switch (status) {
    case PaymentAuthorizationStatus::Success:
    case PaymentAuthorizationStatus::Failure:
        return true;

    case PaymentAuthorizationStatus::InvalidBillingPostalAddress:
    case PaymentAuthorizationStatus::InvalidShippingPostalAddress:
    case PaymentAuthorizationStatus::InvalidShippingContact:
    case PaymentAuthorizationStatus::PINRequired:
    case PaymentAuthorizationStatus::PINIncorrect:
    case PaymentAuthorizationStatus::PINLockout:
        return false;
    }
}

}

namespace WTF {
template<> struct EnumTraits<WebCore::PaymentAuthorizationStatus> {
    using values = EnumValues<
        WebCore::PaymentAuthorizationStatus,
        WebCore::PaymentAuthorizationStatus::Success,
        WebCore::PaymentAuthorizationStatus::Failure,
        WebCore::PaymentAuthorizationStatus::InvalidBillingPostalAddress,
        WebCore::PaymentAuthorizationStatus::InvalidShippingPostalAddress,
        WebCore::PaymentAuthorizationStatus::InvalidShippingContact,
        WebCore::PaymentAuthorizationStatus::PINRequired,
        WebCore::PaymentAuthorizationStatus::PINIncorrect,
        WebCore::PaymentAuthorizationStatus::PINLockout
    >;
};
}

#endif