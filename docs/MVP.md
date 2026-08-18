### 1. Product Overview

- **Project Name:** Drugstore Delivery App B2B
- **Status:** Development Planning
- **Core Objective:** Resolve drugstore delivery challenges by prioritizing simplicity for both drivers and pharmacists.
- **Strategy:** Improve upon competitors (Mobilus, Livramed) by focusing on streamlined logistics, real-time driver tracking, and an absolute minimum-friction interface for the driver.

### 2. Technology Stack & Infrastructure

- **Backend Environment:** Node.js (ideal for real-time dispatching and routing).
- **Database:** PostgreSQL (structured relational data mapping for pharmacies, drivers, and delivery routes).
- **Frontend (Admin Web Dashboard):** React.js.
- **Frontend (Driver Mobile App):** React Native (cross-platform, allowing you to stay in the JavaScript ecosystem).
- **Hosting & Security:** AWS Canada (Montreal Region) to maintain strict data sovereignty for Quebec clients.
- **Third-Party Integrations:**
  - **Mapping & Routing:** Mapbox API.
  - **Communications:** Twilio API for automated notifications.

### 3. General System Requirements

- **Platforms:** Mobile application (Driver Panel) and a web-based dashboard (Admin Panel).
- **Authentication:** Unified login interface offering admin or driver roles.
- **Access Control:** Organization invite codes (keys). Drugstores use these to securely link a driver to their system and dispatch specific delivery queues.

### 4. Pharmacy Integration (MVP Scope)

- **Integration Strategy:** No complex API integrations with existing pharmacy software.
- **Workflow:** Pharmacy admins manually input **only logistical data** (Patient Name, Address, Phone Number, Delivery Window, and Payment Status) into the Admin Panel.
- **Data Scope:** Absolutely no medical, pharmaceutical, or prescription details will be entered or stored in the system.

### 5. Driver Panel MVP

- **Proof of Delivery (PoD):** Maximum simplicity. A single tap to confirm drop-off.
- **Failed Deliveries:** A straightforward "Return Order" button. If a patient is unavailable, this instantly updates the status and routes the driver back to the drugstore to return the physical package.
- **Transactions:** The app handles no digital payment processing. If an order is flagged as unpaid by the admin, the driver collects payment using a physical POS machine at the door and simply taps a "Payment Collected" checkbox in the app.
- **Route Optimization:** Real-time organization of the delivery queue to provide the shortest itinerary via Mapbox.
- **Workflow Tracking:** Categorized tracking statuses: in pharmacy, picked up (prise en charge), and completed.
- **Communications:** Built-in one-tap calling to the pharmacy or the client.
- **Quality Control:** Post-delivery prompt checking if the driver retrieved required items (e.g., fridge/cooler bags).

### 6. Admin Panel MVP

- **Order Management:** Logistical order history view (tracking packages, not prescriptions).
- **Driver Tracking:** Real-time geolocation of the active driver.
- **Billing & Analytics:** Simple, automatic invoice generation for the delivery services rendered, plus generated logistical reports (e.g., average delivery times, success rates).
- **User Management:** Client account creation and admin-specific settings.

### 7. Client Communication

- **Automated Notifications:** The end-client (patient) receives a Twilio-powered SMS or email informing them of their scheduled AM or PM delivery window.

### 8. Privacy & Security

- **Legal Compliance:** Full compliance with Law 25 (Quebec) and PIPEDA (Federal) regarding PII (Personally Identifiable Information).
- **Encryption Standards:** All manually entered logistical data (names, addresses, phone numbers) must be strictly encrypted in transit and at rest.
- **Data Expiration:** Strict data minimization. Drivers only have access to a patient's address and phone number while the delivery is active. Once an order is marked as completed or returned, that data is permanently wiped from the driver's device interface.### 1. Product Overview

- **Project Name:** Drugstore Delivery App B2B
- **Status:** Development Planning
- **Core Objective:** Resolve drugstore delivery challenges by prioritizing simplicity for both drivers and pharmacists.
- **Strategy:** Improve upon competitors (Mobilus, Livramed) by focusing on streamlined logistics, real-time driver tracking, and an absolute minimum-friction interface for the driver.

### 2. Technology Stack & Infrastructure

- **Backend Environment:** Node.js (ideal for real-time dispatching and routing).
- **Database:** PostgreSQL (structured relational data mapping for pharmacies, drivers, and delivery routes).
- **Frontend (Admin Web Dashboard):** React.js.
- **Frontend (Driver Mobile App):** React Native (cross-platform, allowing you to stay in the JavaScript ecosystem).
- **Hosting & Security:** AWS Canada (Montreal Region) to maintain strict data sovereignty for Quebec clients.
- **Third-Party Integrations:**
  - **Mapping & Routing:** Mapbox API.
  - **Communications:** Twilio API for automated notifications.

### 3. General System Requirements

- **Platforms:** Mobile application (Driver Panel) and a web-based dashboard (Admin Panel).
- **Authentication:** Unified login interface offering admin or driver roles.
- **Access Control:** Organization invite codes (keys). Drugstores use these to securely link a driver to their system and dispatch specific delivery queues.

### 4. Pharmacy Integration (MVP Scope)

- **Integration Strategy:** No complex API integrations with existing pharmacy software.
- **Workflow:** Pharmacy admins manually input **only logistical data** (Patient Name, Address, Phone Number, Delivery Window, and Payment Status) into the Admin Panel.
- **Data Scope:** Absolutely no medical, pharmaceutical, or prescription details will be entered or stored in the system.

### 5. Driver Panel MVP

- **Proof of Delivery (PoD):** Maximum simplicity. A single tap to confirm drop-off.
- **Failed Deliveries:** A straightforward "Return Order" button. If a patient is unavailable, this instantly updates the status and routes the driver back to the drugstore to return the physical package.
- **Transactions:** The app handles no digital payment processing. If an order is flagged as unpaid by the admin, the driver collects payment using a physical POS machine at the door and simply taps a "Payment Collected" checkbox in the app.
- **Route Optimization:** Real-time organization of the delivery queue to provide the shortest itinerary via Mapbox.
- **Workflow Tracking:** Categorized tracking statuses: in pharmacy, picked up (prise en charge), and completed.
- **Communications:** Built-in one-tap calling to the pharmacy or the client.
- **Quality Control:** Post-delivery prompt checking if the driver retrieved required items (e.g., fridge/cooler bags).

### 6. Admin Panel MVP

- **Order Management:** Logistical order history view (tracking packages, not prescriptions).
- **Driver Tracking:** Real-time geolocation of the active driver.
- **Billing & Analytics:** Simple, automatic invoice generation for the delivery services rendered, plus generated logistical reports (e.g., average delivery times, success rates).
- **User Management:** Client account creation and admin-specific settings.

### 7. Client Communication

- **Automated Notifications:** The end-client (patient) receives a Twilio-powered SMS or email informing them of their scheduled AM or PM delivery window.

### 8. Privacy & Security

- **Legal Compliance:** Full compliance with Law 25 (Quebec) and PIPEDA (Federal) regarding PII (Personally Identifiable Information).
- **Encryption Standards:** All manually entered logistical data (names, addresses, phone numbers) must be strictly encrypted in transit and at rest.
- **Data Expiration:** Strict data minimization. Drivers only have access to a patient's address and phone number while the delivery is active. Once an order is marked as completed or returned, that data is permanently wiped from the driver's device interface.
