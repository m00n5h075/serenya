# Serenya Web Design Specifications
*Implementation-ready design system for 8 static HTML pages*

---

## Table of Contents
1. [Web Color Palette](#web-color-palette)
2. [Web Typography](#web-typography)
3. [Component Specifications](#component-specifications)
4. [Layout Grid System](#layout-grid-system)
5. [Page Templates](#page-templates)
6. [Interactive States](#interactive-states)
7. [Implementation Guidelines](#implementation-guidelines)

---

## Web Color Palette

### Primary Colors
```css
:root {
  /* Serenya Primary Blues */
  --serenya-blue-primary: #2196F3;
  --serenya-blue-light: #E3F2FD;
  --serenya-blue-dark: #1976D2;
  --serenya-blue-accent: #64B5F6;
  
  /* Secondary Greens (Doctor Reports) */
  --serenya-green-primary: #4CAF50;
  --serenya-green-light: #E8F5E8;
  --serenya-green-dark: #388E3C;
  --serenya-green-accent: #81C784;
  
  /* Neutral Palette */
  --serenya-white: #FFFFFF;
  --serenya-gray-50: #FAFAFA;
  --serenya-gray-100: #F5F5F5;
  --serenya-gray-200: #EEEEEE;
  --serenya-gray-300: #E0E0E0;
  --serenya-gray-400: #BDBDBD;
  --serenya-gray-500: #9E9E9E;
  --serenya-gray-600: #757575;
  --serenya-gray-700: #616161;
  --serenya-gray-800: #424242;
  --serenya-gray-900: #212121;
  
  /* Semantic Colors */
  --color-success: #4CAF50;
  --color-warning: #FF9800;
  --color-error: #FF5252;
  --color-info: #2196F3;
  
  /* Medical Safety Colors */
  --emergency-red: #D32F2F;
  --caution-orange: #FF6F00;
  --safe-green: #2E7D32;
  
  /* Text Colors (WCAG AA Compliant) */
  --text-primary: #212121;
  --text-secondary: #757575;
  --text-disabled: #BDBDBD;
  
  /* Background Colors */
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --bg-tertiary: #F5F5F5;
  
  /* Surface Colors */
  --surface-elevated: #FFFFFF;
  --surface-card: #F8F9FA;
  --surface-border: #E0E0E0;
}
```

### Usage Guidelines
- **Primary Blue**: Main brand color, primary buttons, links, active states
- **Green**: Success states, positive health indicators, secondary CTAs
- **Gray Scale**: Text, backgrounds, borders, disabled states
- **Semantic Colors**: Error/warning/success messages and indicators

---

## Web Typography

### Font Stack
```css
:root {
  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  --font-fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
```

### Heading Styles
```css
h1, .heading-h1 {
  font-family: var(--font-primary);
  font-size: 2.5rem; /* 40px */
  line-height: 1.2;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1.5rem;
}

h2, .heading-h2 {
  font-family: var(--font-primary);
  font-size: 2rem; /* 32px */
  line-height: 1.25;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1.25rem;
}

h3, .heading-h3 {
  font-family: var(--font-primary);
  font-size: 1.5rem; /* 24px */
  line-height: 1.3;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

h4, .heading-h4 {
  font-family: var(--font-primary);
  font-size: 1.25rem; /* 20px */
  line-height: 1.35;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}
```

### Body Text Styles
```css
.body-large, .lead {
  font-family: var(--font-primary);
  font-size: 1.125rem; /* 18px */
  line-height: 1.5;
  font-weight: 400;
  color: var(--text-primary);
}

.body-medium, p {
  font-family: var(--font-primary);
  font-size: 1rem; /* 16px */
  line-height: 1.5;
  font-weight: 400;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.body-small {
  font-family: var(--font-primary);
  font-size: 0.875rem; /* 14px */
  line-height: 1.43;
  font-weight: 400;
  color: var(--text-secondary);
}
```

### Special Text Styles
```css
.medical-disclaimer {
  font-family: var(--font-primary);
  font-size: 0.875rem; /* 14px */
  line-height: 1.5;
  font-weight: 400;
  color: var(--text-secondary);
  font-style: italic;
}

.confidence-score {
  font-family: var(--font-primary);
  font-size: 0.875rem; /* 14px */
  line-height: 1.0;
  font-weight: 600;
  color: var(--text-primary);
}

.emergency-text {
  font-family: var(--font-primary);
  font-size: 0.875rem; /* 14px */
  line-height: 1.43;
  font-weight: 600;
  color: var(--emergency-red);
}
```

### Responsive Typography
```css
/* Mobile adjustments */
@media (max-width: 768px) {
  h1, .heading-h1 { font-size: 2rem; }
  h2, .heading-h2 { font-size: 1.75rem; }
  h3, .heading-h3 { font-size: 1.375rem; }
  .body-large, .lead { font-size: 1rem; }
}
```

---

## Component Specifications

### Primary Button
```css
.btn-primary {
  background-color: var(--serenya-blue-primary);
  color: var(--serenya-white);
  border: none;
  padding: 12px 24px;
  font-family: var(--font-primary);
  font-size: 1rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 48px; /* Accessibility requirement */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.btn-primary:hover {
  background-color: var(--serenya-blue-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
}

.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
}

.btn-primary:focus {
  outline: 2px solid var(--serenya-blue-primary);
  outline-offset: 2px;
}
```

### Secondary Button
```css
.btn-secondary {
  background-color: transparent;
  color: var(--serenya-blue-primary);
  border: 2px solid var(--serenya-blue-primary);
  padding: 10px 22px; /* Adjust for border */
  font-family: var(--font-primary);
  font-size: 1rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.btn-secondary:hover {
  background-color: var(--serenya-blue-light);
  border-color: var(--serenya-blue-dark);
  color: var(--serenya-blue-dark);
}
```

### Card Component
```css
.card {
  background-color: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card-title {
  margin: 0 0 12px 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-description {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}
```

### Form Elements
```css
.form-group {
  margin-bottom: 24px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid var(--surface-border);
  border-radius: 8px;
  font-family: var(--font-primary);
  font-size: 1rem;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  transition: border-color 0.15s ease;
  min-height: 48px;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--serenya-blue-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.form-input::placeholder {
  color: var(--text-disabled);
}
```

### Privacy Badge
```css
.privacy-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--serenya-green-light);
  color: var(--serenya-green-dark);
  border: 1px solid var(--serenya-green-accent);
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
}

.privacy-badge::before {
  content: "🔒";
  font-size: 1rem;
}
```

---

## Layout Grid System

### Container System
```css
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.container-narrow {
  max-width: 800px;
}

.container-wide {
  max-width: 1400px;
}
```

### Responsive Breakpoints
```css
:root {
  --breakpoint-sm: 576px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 992px;
  --breakpoint-xl: 1200px;
}

/* Mobile First Approach */
@media (max-width: 575px) { /* Mobile */ }
@media (min-width: 576px) and (max-width: 767px) { /* Small tablets */ }
@media (min-width: 768px) and (max-width: 991px) { /* Tablets */ }
@media (min-width: 992px) and (max-width: 1199px) { /* Small desktop */ }
@media (min-width: 1200px) { /* Large desktop */ }
```

### Grid System
```css
.row {
  display: flex;
  flex-wrap: wrap;
  margin: 0 -12px;
}

.col {
  flex: 1;
  padding: 0 12px;
}

.col-6 { flex: 0 0 50%; }
.col-4 { flex: 0 0 33.333%; }
.col-3 { flex: 0 0 25%; }

/* Responsive columns */
@media (max-width: 768px) {
  .col-md-12 { flex: 0 0 100%; }
  .row { margin: 0 -8px; }
  .col { padding: 0 8px; }
}
```

### Spacing System
```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-xxl: 48px;
  --spacing-xxxl: 64px;
}

/* Utility classes */
.mt-xs { margin-top: var(--spacing-xs); }
.mt-sm { margin-top: var(--spacing-sm); }
.mt-md { margin-top: var(--spacing-md); }
.mt-lg { margin-top: var(--spacing-lg); }
.mt-xl { margin-top: var(--spacing-xl); }
.mt-xxl { margin-top: var(--spacing-xxl); }

.mb-xs { margin-bottom: var(--spacing-xs); }
.mb-sm { margin-bottom: var(--spacing-sm); }
.mb-md { margin-bottom: var(--spacing-md); }
.mb-lg { margin-bottom: var(--spacing-lg); }
.mb-xl { margin-bottom: var(--spacing-xl); }
.mb-xxl { margin-bottom: var(--spacing-xxl); }

.py-lg { padding-top: var(--spacing-lg); padding-bottom: var(--spacing-lg); }
.py-xl { padding-top: var(--spacing-xl); padding-bottom: var(--spacing-xl); }
.py-xxl { padding-top: var(--spacing-xxl); padding-bottom: var(--spacing-xxl); }
```

---

## Page Templates

### 1. Homepage Layout
```html
<header class="header">
  <nav class="navbar">
    <div class="container">
      <div class="navbar-brand">
        <img src="logo.svg" alt="Serenya" class="logo">
      </div>
      <div class="navbar-nav">
        <a href="#" class="nav-link">How It Works</a>
        <a href="#" class="nav-link">Features</a>
        <a href="#" class="nav-link">Pricing</a>
        <a href="#" class="nav-link">About</a>
        <a href="#" class="btn-primary">Get Started Free</a>
      </div>
    </div>
  </nav>
</header>

<main>
  <!-- Hero Section -->
  <section class="hero py-xxl">
    <div class="container">
      <div class="row">
        <div class="col-6">
          <h1>Welcome to Serenya</h1>
          <p class="lead">Your AI Health Agent</p>
          <p class="body-large">We help you understand your lab results in plain language and prepare for confident conversations with your doctor.</p>
          <div class="cta-buttons">
            <a href="#" class="btn-primary">Get Started Free</a>
            <a href="#" class="btn-secondary">See How It Works</a>
          </div>
        </div>
        <div class="col-6">
          <img src="hero-image.jpg" alt="Person confidently discussing lab results with doctor" class="hero-image">
        </div>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="features py-xl">
    <div class="container">
      <h2>Transform Medical Confusion Into Clarity</h2>
      <p class="lead">Upload your lab results and get instant explanations you can actually understand.</p>
      
      <div class="row mt-xxl">
        <div class="col-4">
          <div class="card">
            <div class="feature-icon">📄</div>
            <h3 class="card-title">Upload Lab Results</h3>
            <p class="card-description">Files from any medical provider</p>
          </div>
        </div>
        <div class="col-4">
          <div class="card">
            <div class="feature-icon">🧠</div>
            <h3 class="card-title">Get Clear Explanations</h3>
            <p class="card-description">Medical terms in language you understand</p>
          </div>
        </div>
        <div class="col-4">
          <div class="card">
            <div class="feature-icon">✅</div>
            <h3 class="card-title">Feel More Confident</h3>
            <p class="card-description">Arrive prepared for your next doctor visit</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Privacy Section -->
  <section class="privacy py-xl">
    <div class="container">
      <h2>Your Privacy Comes First</h2>
      <p class="lead">We understand health data is deeply personal. Here's how we protect yours:</p>
      
      <div class="privacy-features mt-lg">
        <div class="privacy-feature">
          <div class="privacy-badge">Device-Only Storage</div>
          <p>Files processed instantly, then deleted—all your data stays on your device</p>
        </div>
        <!-- Additional privacy features... -->
      </div>
    </div>
  </section>
</main>

<footer class="footer">
  <!-- Footer content -->
</footer>
```

### 2. How It Works Page Layout
```html
<main>
  <section class="page-header py-xl">
    <div class="container">
      <h1>How Serenya Works</h1>
      <p class="lead">Transform your lab results into clarity in just 3 simple steps</p>
    </div>
  </section>

  <section class="steps py-xl">
    <div class="container">
      <div class="step">
        <div class="row">
          <div class="col-6">
            <div class="step-number">1</div>
            <h3>Upload Your Lab Results</h3>
            <p>Drag and drop or select files from any medical provider. We accept PDFs, images, and most document formats.</p>
            <ul>
              <li>Support for all major lab formats</li>
              <li>Secure, encrypted upload process</li>
              <li>Works with reports from any healthcare provider</li>
            </ul>
          </div>
          <div class="col-6">
            <div class="step-visual">📤</div>
          </div>
        </div>
      </div>
      <!-- Steps 2 and 3... -->
    </div>
  </section>
</main>
```

### 3. Features Page Layout
```html
<main>
  <section class="page-header py-xl">
    <div class="container-narrow">
      <h1>Powerful Features for Better Health Understanding</h1>
      <p class="lead">Everything you need to transform complex medical data into actionable health insights.</p>
    </div>
  </section>

  <section class="feature-details py-xl">
    <div class="container">
      <div class="feature-detail">
        <div class="row">
          <div class="col-8">
            <h2>Advanced Document Analysis</h2>
            <p class="lead">Instant processing of any lab report or medical document</p>
            <p>Our cutting-edge AI engine processes lab reports, medical documents, and health records from any provider in seconds...</p>
            
            <h4>Key Benefits:</h4>
            <ul>
              <li>Process multiple document types (PDF, images, scanned reports)</li>
              <li>Instant analysis in under 30 seconds</li>
              <li>99.9% accuracy in data extraction</li>
            </ul>
          </div>
          <div class="col-4">
            <div class="feature-image">📊</div>
          </div>
        </div>
      </div>
      <!-- Additional features... -->
    </div>
  </section>
</main>
```

### 4. Pricing Page Layout
```html
<main>
  <section class="pricing py-xl">
    <div class="container">
      <h1>Simple, Transparent Pricing</h1>
      <p class="lead">We believe everyone should have access to understanding their health data.</p>
      
      <div class="pricing-cards mt-xxl">
        <div class="row">
          <div class="col-4">
            <div class="pricing-card">
              <div class="plan-badge">Always Free</div>
              <h3>Free Plan</h3>
              <div class="price">
                <span class="currency">$</span>
                <span class="amount">0</span>
                <span class="period">/month</span>
              </div>
              <p>Perfect for occasional lab result analysis</p>
              
              <ul class="features-list">
                <li>✅ Upload and analyze up to 3 documents per month</li>
                <li>✅ Basic AI analysis and explanations</li>
                <li>✅ Plain language summaries</li>
                <li>✅ Privacy-first processing</li>
              </ul>
              
              <a href="#" class="btn-secondary btn-full-width">Start Free</a>
            </div>
          </div>
          
          <div class="col-4">
            <div class="pricing-card pricing-card-featured">
              <div class="plan-badge popular">Most Popular</div>
              <h3>Premium Plan</h3>
              <div class="price">
                <span class="currency">$</span>
                <span class="amount">9.99</span>
                <span class="period">/month</span>
              </div>
              <!-- Premium features... -->
              <a href="#" class="btn-primary btn-full-width">Start Premium Trial</a>
            </div>
          </div>
          
          <!-- Family plan... -->
        </div>
      </div>
    </div>
  </section>
</main>
```

### 5. Security & Privacy Page Layout
```html
<main>
  <section class="security-header py-xl">
    <div class="container-narrow">
      <h1>Your Privacy Is Our Priority</h1>
      <p class="lead">We understand that health data is among the most personal information you have. That's why we've built Serenya with privacy-by-design principles.</p>
    </div>
  </section>

  <section class="security-features py-xl">
    <div class="container">
      <div class="security-feature">
        <div class="row">
          <div class="col-8">
            <h2>Zero Cloud Storage Policy</h2>
            <p class="lead">Your health documents and analysis results are processed instantly and then permanently deleted from our servers.</p>
            <ul>
              <li>Documents processed and deleted within seconds</li>
              <li>Analysis results stored locally on your device only</li>
              <li>No cloud storage of personal health information</li>
            </ul>
          </div>
          <div class="col-4">
            <div class="security-icon">🔒</div>
          </div>
        </div>
      </div>
      <!-- Additional security features... -->
    </div>
  </section>
</main>
```

### Common Layout Elements

#### Navigation Bar
```css
.navbar {
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--surface-border);
  padding: 16px 0;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.navbar-brand .logo {
  height: 32px;
  width: auto;
}

.navbar-nav {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-left: auto;
}

.nav-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
}

.nav-link:hover {
  color: var(--serenya-blue-primary);
}

@media (max-width: 768px) {
  .navbar-nav {
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }
}
```

#### Footer
```css
.footer {
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--surface-border);
  padding: 48px 0 24px;
  margin-top: 64px;
}

.footer-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 32px;
}

.footer-section h4 {
  margin-bottom: 16px;
  color: var(--text-primary);
}

.footer-link {
  display: block;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 4px 0;
  transition: color 0.15s ease;
}

.footer-link:hover {
  color: var(--serenya-blue-primary);
}
```

---

## Interactive States

### Hover Effects
```css
/* Button hover states already defined above */

/* Link hover states */
a:hover {
  color: var(--serenya-blue-dark);
  transition: color 0.15s ease;
}

/* Card hover states */
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  transition: all 0.25s ease;
}

/* Image hover effects */
.feature-image:hover {
  transform: scale(1.05);
  transition: transform 0.25s ease;
}
```

### Focus States
```css
/* Focus ring for all interactive elements */
*:focus {
  outline: 2px solid var(--serenya-blue-primary);
  outline-offset: 2px;
}

/* Custom focus styles for specific elements */
.btn-primary:focus {
  outline: 2px solid var(--serenya-blue-dark);
  outline-offset: 2px;
}

.form-input:focus {
  border-color: var(--serenya-blue-primary);
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}
```

### Active States
```css
.btn-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
}

.btn-secondary:active {
  background-color: var(--serenya-blue-primary);
  color: var(--serenya-white);
}
```

### Loading States
```css
.btn-loading {
  position: relative;
  color: transparent;
  pointer-events: none;
}

.btn-loading::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
```

---

## Implementation Guidelines

### HTML Structure Best Practices
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Transform your lab results into clear insights with Serenya AI">
  <title>Page Title | Serenya</title>
  
  <!-- Preload critical fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  
  <!-- Critical CSS inline -->
  <style>/* Critical above-the-fold styles */</style>
  
  <!-- Non-critical CSS -->
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- Content structure -->
</body>
</html>
```

### CSS Organization
```
styles/
├── 01-variables.css      /* CSS custom properties */
├── 02-reset.css          /* CSS reset/normalize */
├── 03-typography.css     /* Typography styles */
├── 04-components.css     /* Component styles */
├── 05-layout.css         /* Grid and layout */
├── 06-utilities.css      /* Utility classes */
└── 07-pages.css          /* Page-specific styles */
```

### Accessibility Requirements
- **Minimum contrast ratio**: 4.5:1 for normal text, 3:1 for large text
- **Touch targets**: Minimum 44px × 44px for mobile
- **Focus indicators**: Visible on all interactive elements
- **Semantic HTML**: Use proper heading hierarchy, landmarks, and ARIA attributes
- **Alt text**: Descriptive alternative text for all images
- **Keyboard navigation**: All interactive elements accessible via keyboard

### Performance Considerations
```css
/* Optimize animations */
.card {
  will-change: transform;
  transform: translateZ(0); /* Enable hardware acceleration */
}

/* Efficient transitions */
.btn-primary {
  transition: background-color 0.15s ease, transform 0.15s ease;
}

/* Contain layout shifts */
.hero-image {
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
```

### Mobile-First Responsive Design
```css
/* Base styles (mobile) */
.hero {
  padding: 32px 0;
}

.hero h1 {
  font-size: 2rem;
}

/* Tablet and up */
@media (min-width: 768px) {
  .hero {
    padding: 64px 0;
  }
  
  .hero h1 {
    font-size: 2.5rem;
  }
}

/* Desktop and up */
@media (min-width: 1200px) {
  .hero {
    padding: 96px 0;
  }
}
```

### Browser Support
- **Modern browsers**: Chrome 88+, Firefox 78+, Safari 14+, Edge 88+
- **Graceful degradation**: CSS Grid with Flexbox fallback
- **Progressive enhancement**: Core functionality works without JavaScript

---

## Implementation Checklist

### Before Development
- [ ] Set up CSS custom properties for colors and spacing
- [ ] Configure Inter font loading with proper fallbacks
- [ ] Create component library starting with buttons and forms
- [ ] Set up responsive grid system

### During Development
- [ ] Test on mobile devices throughout development
- [ ] Validate HTML and run accessibility audits
- [ ] Optimize images and implement lazy loading
- [ ] Test keyboard navigation on all pages

### Before Launch
- [ ] Performance audit (Lighthouse score 90+)
- [ ] Cross-browser testing
- [ ] Accessibility compliance verification (WCAG AA)
- [ ] SEO meta tags and structured data implementation

---

This web design specification provides everything needed to implement 8 professional, accessible, and performant HTML pages that maintain Serenya's brand identity while being optimized for web use. The design system translates the mobile app's healthcare-focused design principles to web while adding web-specific optimizations and best practices.