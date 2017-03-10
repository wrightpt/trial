/*
 * Copyright (C) 2015, 2016 Apple Inc. All rights reserved.
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

#include "PaymentContact.h"
#include <wtf/EnumTraits.h>
#include <wtf/Optional.h>
#include <wtf/Vector.h>
#include <wtf/text/WTFString.h>

namespace WebCore {

enum class PaymentAuthorizationStatus;

class PaymentRequest {
public:
    WEBCORE_EXPORT PaymentRequest();
    WEBCORE_EXPORT ~PaymentRequest();

    const String& countryCode() const { return m_countryCode; }
    void setCountryCode(const String& countryCode) { m_countryCode = countryCode; }

    const String& currencyCode() const { return m_currencyCode; }
    void setCurrencyCode(const String& currencyCode) { m_currencyCode = currencyCode; }

    struct ContactFields {
        bool postalAddress { false };
        bool phone { false };
        bool email { false };
        bool name { false };
    };

    const ContactFields& requiredBillingContactFields() const { return m_requiredBillingContactFields; }
    void setRequiredBillingContactFields(const ContactFields& requiredBillingContactFields) { m_requiredBillingContactFields = requiredBillingContactFields; }

    const PaymentContact& billingContact() const { return m_billingContact; }
    void setBillingContact(const PaymentContact& billingContact) { m_billingContact = billingContact; }

    const ContactFields& requiredShippingContactFields() const { return m_requiredShippingContactFields; }
    void setRequiredShippingContactFields(const ContactFields& requiredShippingContactFields) { m_requiredShippingContactFields = requiredShippingContactFields; }

    const PaymentContact& shippingContact() const { return m_shippingContact; }
    void setShippingContact(const PaymentContact& shippingContact) { m_shippingContact = shippingContact; }

    static bool isValidSupportedNetwork(unsigned version, const String&);

    const Vector<String>& supportedNetworks() const { return m_supportedNetworks; }
    void setSupportedNetworks(const Vector<String>& supportedNetworks) { m_supportedNetworks = supportedNetworks; }

    struct MerchantCapabilities {
        bool supports3DS { false };
        bool supportsEMV { false };
        bool supportsCredit { false };
        bool supportsDebit { false };
    };

    const MerchantCapabilities& merchantCapabilities() const { return m_merchantCapabilities; }
    void setMerchantCapabilities(const MerchantCapabilities& merchantCapabilities) { m_merchantCapabilities = merchantCapabilities; }

    struct LineItem {
        enum class Type {
            Pending,
            Final,
        } type { Type::Final };

        // Stored as a fixed point decimal number with two decimals:
        // 1.23 -> 123.
        // 0.01 -> 1.
        std::optional<int64_t> amount;
        String label;
    };

    enum class ShippingType {
        Shipping,
        Delivery,
        StorePickup,
        ServicePickup,
    };
    ShippingType shippingType() const { return m_shippingType; }
    void setShippingType(ShippingType shippingType) { m_shippingType = shippingType; }

    struct ShippingMethod {
        String label;
        String detail;
        int64_t amount;

        String identifier;
    };
    const Vector<ShippingMethod>& shippingMethods() const { return m_shippingMethods; }
    void setShippingMethods(const Vector<ShippingMethod>& shippingMethods) { m_shippingMethods = shippingMethods; }

    const Vector<LineItem>& lineItems() const { return m_lineItems; }
    void setLineItems(const Vector<LineItem>& lineItems) { m_lineItems = lineItems; }

    const LineItem& total() const { return m_total; };
    void setTotal(const LineItem& total) { m_total = total; }

    struct TotalAndLineItems {
        PaymentRequest::LineItem total;
        Vector<PaymentRequest::LineItem> lineItems;
    };

    const String& applicationData() const { return m_applicationData; }
    void setApplicationData(const String& applicationData) { m_applicationData = applicationData; }

private:
    String m_countryCode;
    String m_currencyCode;

    ContactFields m_requiredBillingContactFields;
    PaymentContact m_billingContact;

    ContactFields m_requiredShippingContactFields;
    PaymentContact m_shippingContact;

    Vector<String> m_supportedNetworks;
    MerchantCapabilities m_merchantCapabilities;

    ShippingType m_shippingType { ShippingType::Shipping };
    Vector<ShippingMethod> m_shippingMethods;

    Vector<LineItem> m_lineItems;
    LineItem m_total;

    String m_applicationData;
};

struct PaymentError {
    enum class Code {
        Unknown,
        ShippingContactInvalid,
        BillingContactInvalid,
        AddressUnservicable,
    };

    enum class ContactField {
        PhoneNumber,
        EmailAddress,
        GivenName,
        FamilyName,
        AddressLines,
        Locality,
        PostalCode,
        AdministrativeArea,
        Country,
        CountryCode,
    };

    Code code;
    String message;
    std::optional<ContactField> contactField;
};

struct PaymentAuthorizationResult {
    PaymentAuthorizationStatus status;
    Vector<PaymentError> errors;
};

struct PaymentMethodUpdate {
    PaymentAuthorizationStatus status;
    PaymentRequest::TotalAndLineItems newTotalAndLineItems;
};

struct ShippingContactUpdate {
    PaymentAuthorizationStatus status;
    Vector<PaymentError> errors;

    Vector<PaymentRequest::ShippingMethod> newShippingMethods;
    PaymentRequest::TotalAndLineItems newTotalAndLineItems;
};

struct ShippingMethodUpdate {
    PaymentAuthorizationStatus status;
    PaymentRequest::TotalAndLineItems newTotalAndLineItems;
};

}

namespace WTF {

template<> struct EnumTraits<WebCore::PaymentError::Code> {
    using values = EnumValues<
        WebCore::PaymentError::Code,
        WebCore::PaymentError::Code::Unknown,
        WebCore::PaymentError::Code::ShippingContactInvalid,
        WebCore::PaymentError::Code::BillingContactInvalid,
        WebCore::PaymentError::Code::AddressUnservicable
    >;
};

template<> struct EnumTraits<WebCore::PaymentError::ContactField> {
    using values = EnumValues<
        WebCore::PaymentError::ContactField,
        WebCore::PaymentError::ContactField::PhoneNumber,
        WebCore::PaymentError::ContactField::EmailAddress,
        WebCore::PaymentError::ContactField::GivenName,
        WebCore::PaymentError::ContactField::FamilyName,
        WebCore::PaymentError::ContactField::AddressLines,
        WebCore::PaymentError::ContactField::Locality,
        WebCore::PaymentError::ContactField::PostalCode,
        WebCore::PaymentError::ContactField::AdministrativeArea,
        WebCore::PaymentError::ContactField::Country,
        WebCore::PaymentError::ContactField::CountryCode
    >;
};

}

#endif
