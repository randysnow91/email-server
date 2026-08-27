# Software Requirements Document (SRD)
## Email Server - Release 1

**Document Title:** Email Server - Release 1 SRD  
**Version:** 1.0  
**Date:** August 2026  
**Status:** Draft

---

## 1. Executive Summary

Email Server Release 1 is a foundational email campaign management platform that enables users to build, manage, and send daily emails to a subscriber list. R1 focuses on core functionality: subscriber management, email composition via multiple template sections, and email delivery. All content management is manual in R1, with automation planned for future releases.

---

## 2. Purpose & Goals

### Purpose

Email Server is a multi-tenant email campaign platform designed to allow users to manage subscriber lists and send templated emails at scale. Release 1 establishes the core system for single-user operation (Randy Snow) with infrastructure designed to support multi-user expansion in future releases.

### Goals (R1)

- Enable daily email sending to a subscriber list
- Provide subscriber management (subscribe, unsubscribe, preferences)
- Support modular email composition (header, title, body, ads, footer sections)
- Establish database and API infrastructure for multi-user expansion (R4)
- Integrate with external SMTP service for email delivery
- Support subscriber preference selection (daily/weekly/both)

*Note: R1 is daily only; weekly will come with R3* Unsubscribe and preferences will also come with R3

---

## 3. Release Scope

### Included in Release 1

- Email Manager: Subscriber list management
- Email Builder: Compose emails from multiple sections
- Email Sender: Send emails via SMTP service provider
- Subscriber Features: Subscribe
- Basic Account Structure: Foundation for multi-user (R4)
- Manual operation: All actions triggered manually (no scheduling)

### Excluded from Release 1

- Content Builder automation (R2)
- Weekly email sending (R3)
- Unsubscribe functionality with link management (R3)
- Subscriber engagement analytics
- Multi-user accounts and admin controls (R4)
- Payment processing and billing tiers (R4)

---

## 4. System Overview

### Architecture

Email Server consists of three logical components:

- **Email Manager:** Manages subscriber data, preferences, and account information
- **Email Builder:** Composes emails by combining template sections
- **Email Sender:** Sends completed emails via external SMTP provider

*Design Preference:* If possible and a good design, each component (Email Manager, Email Builder, Email Sender) should be separate agents that get called as needed. This would provide valuable learning experience.

### User Roles

- **Email Administrator (R1):** Manages all aspects of an email server (currently Randy Snow only)
- **Subscriber:** Receives emails and manages preferences (R1 basic; full management in R3)
- **Super Admin (R4): ** Manages the email accounts (AI PM Perspective or Dog Rescue) 

### Integration Points

- **SMTP Service Provider** (SendGrid/Mailgun/AWS SES): Email delivery
- **Content Builder** (separate app, R2+): Provides main body content via API/file link

---

## 5. Functional Requirements

### 5.1 Email Manager

#### 5.1.1 Subscriber Management

- **FR-1.1:** System shall allow new subscribers to register via a public subscribe form
- **FR-1.2:** System shall capture subscriber email address and [R3] subscription preference (daily, weekly, or both)
- **FR-1.3:** System shall store subscriber email with associated account (email_server_id)
- **FR-1.4:** System shall allow admin to view all subscribers for an account
- **FR-1.5:** System shall allow admin to manually add subscribers to the list
- **FR-1.6:** System shall allow admin to remove subscribers from the list
- **FR-1.7:** [R3] System shall allow subscribers to change preference (daily/weekly/both) via options screen

#### 5.1.2 Account Management

- **FR-1.8:** System shall create unique accounts for multiple email servers (e.g., AI PM Perspective, Dog Rescue)
- **FR-1.9:** System shall maintain account metadata (name, description, created_at)
- **FR-1.10:** System shall support account activation (R4; R1 assumes all accounts active)

### 5.2 Email Builder

#### 5.2.1 Email Composition

- **FR-2.1:** System shall support email composition from: Subject, Header, Title, About, Main Body, Advertisement, Editor's Section, Footer
- **FR-2.2:** System shall allow admin to add/edit/delete each email section via web interface
- **FR-2.3:** System shall store each section in the database with section type and content
- **FR-2.4:** System shall support empty sections (sections can be omitted without breaking email layout)
- **FR-2.5:** System shall combine all active sections into a single email
- **FR-2.6:** Email sections shall be persisted and reusable across multiple sends. The one that changes each build is the main body.

#### 5.2.2 Main Body Content

- **FR-2.7:** System shall allow admin to manually paste content into Main Body section
- **FR-2.8:** System shall support linking to external content source for Main Body (URL TBD with R2 design)
- **FR-2.9:** System shall prioritize manually pasted content over linked content if both are present
- **FR-2.10:** System shall validate Main Body content before email send (ensure it exists)

### 5.3 Email Sender

- **FR-3.1:** System shall integrate with external SMTP service provider
- **FR-3.2:** System shall only provide the SMTP service with the current subscriber's name and email address
- **FR-3.3:** System shall NOT expose subscriber list to other subscribers
- **FR-3.4:** System shall send email from a configured sender address
- **FR-3.5:** System shall handle SMTP errors gracefully and provide user feedback
- **FR-3.6:** System shall support manual triggering of send (no scheduling in R1)
- **FR-3.7:** System shall log each send attempt with timestamp and status

---

## 6. Non-Functional Requirements

### 6.1 Performance

- **NFR-1.1:** Email and subscriber list shall be sent to the SMTP API and complete within 5 seconds for up to 1000 subscribers
- **NFR-1.2:** Subscriber list page shall load within 2 seconds
- **NFR-1.3:** Email builder shall render preview within 1 second

### 6.2 Scalability

- **NFR-2.1:** System shall support minimum 1000 subscribers per account in R1
- **NFR-2.2:** Architecture shall accommodate multi-user accounts without code refactoring
- **NFR-2.3:** Database design shall support multiple email servers per user

### 6.3 Security & Privacy

- **NFR-3.1:** System shall NOT expose full subscriber list in emails
- **NFR-3.2:** System shall NOT display other subscribers' email addresses to any subscriber
- **NFR-3.3:** Subscriber data shall be encrypted in transit (HTTPS)
- **NFR-3.4:** SMTP credentials shall be stored securely (environment variables or secrets manager)
- **NFR-3.5:** Admin access to subscriber data shall be role-based

---

## 7. Data Model

The data model will be determined by Claude Code, but here is the list of what we think we will need:

### Subscribers
- `id` (UUID, PK)
- `email` (VARCHAR)
- `email_server_id` (UUID FK) — which newsletter they're subscribed to
- `subscription_preference` (ENUM: daily, weekly, both)
- `created_at` (TIMESTAMP)
- `unsubscribed` (BOOLEAN) — for R3

### Email_Sections
- `id` (UUID, PK)
- `email_server_id` (UUID FK)
- `section_type` (ENUM: header, title, about, main_body, ad, editor, footer)
- `content` (TEXT) — HTML or markdown
- `updated_at` (TIMESTAMP)

### Email_History
- `id` (UUID, PK)
- `email_server_id` (UUID FK)
- `sent_date` (TIMESTAMP)
- `section_data` (TEXT) — snapshot of all sections that were combined

### Email_Servers
- `id` (UUID, PK)
- `user_id` (UUID FK) — owner (for R4 multi-user)
- `name` (VARCHAR) — AI PM Perspective, Dog Rescue, etc.
- `created_at` (TIMESTAMP)

---

## 8. User Interface / Screens

### 8.1 Public Screens (Subscriber-Facing)

**Subscribe Screen:**
- Email input field
- [R3] Preference radio buttons (daily/weekly/both)
- Subscribe button
- [R1] Success/confirmation message ("Thanks for subscribing!")

**Unsubscribe Screen:**
- Email input (optional, can be pre-populated)
- Confirmation message
- Confirm button

**Preferences Screen:**
- Email field or URL parameter
- [R3] Preference radio buttons
- Save button

### 8.2 Admin Screens (Email Manager-Facing)

**Dashboard:**
- Account selector
- Subscriber count summary
- Recent send history
- Quick navigation links

**Subscriber Management:**
- Table view (Email, Preference, Created Date, Actions)
- Filter/search
- Add/Edit/Delete subscriber buttons

**Email Builder:**
- Section editor tabs for each section type
- Rich text/HTML editor per section
- Main Body with paste and link options
- Live email preview pane
- Save and Test Send buttons

**Send Email Screen:**
- Email preview display
- Recipient count confirmation
- Send button with confirmation dialog
- Progress indicator
- Send result summary

### 8.3 Super Admin Screens (R4)

- View different accounts with ability to Activate, Hold, or Delete
- Account information: account manager name, email, phone number, tier (pricing plan/level), last payment date, last payment amount
- Pricing screen to set up tier pricing

---

## 9. User Flows & Workflows

### 9.1 Subscriber Journey

1. Subscriber navigates to public subscribe page
2. Enters email and [R3] selects preference (daily/weekly/both)
3. Clicks Subscribe button
4. System validates email format
5. System saves subscriber to database
6. System displays success message to subscriber

### 9.2 Admin Daily Send Workflow (R1 Manual)

1. Admin logs into Email Server dashboard
2. Navigates to Email Builder screen
3. Reviews existing sections (header, footer, etc.)
4. Enters or pastes main body content
5. Clicks preview to review composed email
6. Optionally sends test email to own address
7. Clicks Send Email button
8. System confirms recipient count and preferences
9. Admin confirms send action
10. System sends emails to subscribers via SMTP
11. System logs send history with status and timestamps
12. System displays completion summary with success/failure count

---

## 10. Constraints & Assumptions

### Technical Constraints

- No subscriber shall be able to see other subscribers' email addresses
- SMTP service selected must support error handling and delivery confirmation
- Email sending is synchronous in R1 (can be made asynchronous)
- Subscriber data must remain private (no exposure to other subscribers)
- Implementation method (BCC, individual sends, etc.) is at engineering discretion

### Business Constraints

- R1 is single-user only (Randy Snow, AI PM Perspective newsletter)
- No analytics/engagement tracking in R1
- No automated scheduling in R1 (manual trigger only)
- Content management is completely manual in R1

### Assumptions

- SMTP service will be selected and configured before R1 build begins
- Initial subscriber base will be small (< 1000)
- Email sections will be HTML-based or markdown (depends on sending service needs)
- Admin user is trusted (no separate authentication in R1; multi-user auth in R4)
- Unsubscribe handling is manual in R1 (admin removes subscriber or email-based request)

---

## 11. Testing Strategy

**Unit Testing:**
- Email validation logic
- [R3] Preference validation (daily/weekly/both)
- Email section composition
- Database CRUD operations

**Integration Testing:**
- Subscribe flow end-to-end
- Email builder → send flow
- SMTP provider integration
- Send history logging

**Manual Testing:**
- UI usability testing
- Email rendering in different email clients
- Privacy constraint validation (no list exposure)

**Performance Testing:**
- Send time with 100+ subscribers
- Database query performance for subscriber list retrieval
- UI response times

---

## 12. Success Criteria

- Subscribers can successfully register via public form
- Admin can compose and send emails with all sections rendering correctly
- Emails are delivered without exposing subscriber list to other subscribers
- Send history is logged and accessible to admin
- System supports up to 1000 subscribers without performance degradation
- Email sections are persisted and reusable across multiple sends
- All UI screens are functional, intuitive, and mobile-responsive

---

## 13. Dependencies & External Services

### SMTP Service Provider

**Selection:** TBD (SendGrid, Mailgun, AWS SES, or alternative)

**Requirements:**
- Free or low-cost tier for R1 testing (dozen subscribers)
- Production-grade reliability and uptime SLA for scaling
- Support for sending that does not expose full subscriber list
- Error reporting, bounce handling, and retry mechanism
- Suitable for multi-user SMTP account management (R4 planning)

---

## 14. Future Considerations (R2+)

### Release 2: Content Automation & Scheduling

- Fetch main body content from Content Builder API/external URL
- Message queuing for asynchronous sends

### Release 3: Weekly & Subscriber Features

- Weekly email composition and sending capabilities
- Unsubscribe link in emails with auto-management
- Preference link in emails (daily/weekly/both) with auto-management
- Basic engagement tracking (opens, clicks)

### Release 4: Multi-User

- User authentication and authorization system
- Admin controls (pause account, remove account, account management)
- Payment processing and tiered billing ($0 < 100 subscribers, $20/month 100-500, etc.)
- Custom sending domains per user account
- Multi-tenant SMTP account management
- User-specific engagement analytics and reporting

---

*End of Document*
