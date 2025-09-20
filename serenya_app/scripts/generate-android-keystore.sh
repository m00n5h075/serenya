#!/bin/bash

# Android Keystore Generation Script for Serenya App
# This script generates a release keystore for Google Play Store submission

echo "🔐 Generating Android Release Keystore for Serenya App"
echo "=================================================="

# Create keystore directory
mkdir -p ../android/keystore

# Generate the keystore
echo "Creating release keystore..."
keytool -genkey -v -keystore ../android/keystore/serenya-release-keystore.jks \
    -alias serenya-release-key \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$(read -s -p 'Enter keystore password: '; echo $REPLY)" \
    -keypass "$(read -s -p 'Enter key password: '; echo $REPLY)" \
    -dname "CN=Serenya, OU=Mobile, O=Serenya Inc, L=San Francisco, ST=CA, C=US"

echo ""
echo "✅ Keystore generated successfully!"
echo ""
echo "Next steps:"
echo "1. Copy android/key.properties.template to android/key.properties"
echo "2. Fill in your actual passwords in key.properties"
echo "3. Keep your keystore file safe - you'll need it for all future app updates"
echo ""
echo "⚠️  IMPORTANT: Back up your keystore file securely!"
echo "   If you lose it, you won't be able to update your app on Google Play"