#!/bin/bash

# Simple test runner for Serenya Flutter app
# Usage: ./test_runner.sh [web|test|analyze]

export PATH="/Users/m00n5h075ai/development/serenya/flutter/bin:$PATH"

case "$1" in
    "web")
        echo "🌐 Starting Flutter web development server..."
        echo "📱 This will run the onboarding app in your browser"
        echo "🔄 Press Ctrl+C to stop"
        flutter run -d chrome --web-port 8080
        ;;
    "test")
        echo "🧪 Running Flutter tests..."
        flutter test
        ;;
    "analyze")
        echo "🔍 Analyzing Flutter code..."
        flutter analyze
        ;;
    "doctor")
        echo "🩺 Running Flutter doctor..."
        flutter doctor
        ;;
    "get")
        echo "📦 Getting Flutter dependencies..."
        flutter pub get
        ;;
    *)
        echo "🚀 Serenya Flutter App Test Environment"
        echo ""
        echo "Available commands:"
        echo "  ./test_runner.sh web      - Run app in Chrome browser"
        echo "  ./test_runner.sh test     - Run widget/unit tests"
        echo "  ./test_runner.sh analyze  - Check code quality"
        echo "  ./test_runner.sh doctor   - Check Flutter environment"
        echo "  ./test_runner.sh get      - Get Flutter dependencies"
        echo ""
        echo "💡 Quick start: ./test_runner.sh web"
        ;;
esac