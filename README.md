# FreelancerHub

A freelance marketplace backend built with **NestJS**, **Prisma ORM**, and **PostgreSQL**. The platform connects clients with freelancers, allowing clients to publish projects and receive proposals, while freelancers can submit proposals and deliver completed work.

## Features

### Authentication & Users
- User registration and login.
- JWT-based authentication.
- Refresh token rotation and session management.
- Logout from the current session or other sessions.
- Role-based access control.
- User account management and banning.

### Projects & Proposals
- Browse available projects.
- Create and manage projects as a client.
- Submit proposals as a freelancer.
- Accept or reject proposals.
- Track project status.

### Freelancer Profiles
- Create and update freelancer profiles.
- Manage profile information.
- Upload profile avatars.

### Wallet & Transactions
- Wallet balance management.
- Deposit and transaction records.
- Payment holding and payout workflow.
- Commission handling.

### Deliveries
- Upload project deliveries.
- View and download submitted files.
- Client delivery approval workflow.

### Background Jobs
- BullMQ integration for background job processing.
- Redis connection for queue management.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| NestJS | Backend framework |
| TypeScript | Programming language |
| Prisma ORM | Database access |
| PostgreSQL | Relational database |
| Redis | Queue infrastructure |
| BullMQ | Background job processing |
| JWT | Authentication |
| Multer | File uploads |

---

## System Roles

The system supports three main roles:

| Role | Description |
|---|---|
| ADMIN | Manages users, categories, and platform operations |
| CLIENT | Publishes projects, reviews proposals, and approves deliveries |
| FREELANCER | Creates a professional profile, submits proposals, and delivers work |

Visitors can browse public content and register or log in.

---

# System Diagrams

## 1. Use Case Diagram

The following diagram illustrates the main interactions between system actors and FreelancerHub.

```mermaid
flowchart LR
    Visitor([Visitor])
    Client([Client])
    Freelancer([Freelancer])
    Admin([Admin])

    subgraph FreelancerHub["FreelancerHub System"]
        UC1([Browse Open Projects])
        UC2([View Categories])
        UC3([View Freelancer Profiles])
        UC4([Register / Login])

        UC5([Manage Account])
        UC6([Refresh Session])
        UC7([Logout])

        UC8([Publish Project])
        UC9([Manage Projects])
        UC10([View Proposals])
        UC11([Accept Proposal])
        UC12([Manage Wallet])
        UC13([View Transactions])
        UC14([Approve Delivery])
        UC15([Download Delivery])

        UC16([Submit Proposal])
        UC17([Manage Freelancer Profile])
        UC18([Upload Delivery])
        UC19([View Proposal Status])

        UC20([Manage Users])
        UC21([Ban / Unban Users])
        UC22([Manage Categories])
        UC23([Access Deliveries])
    end

    Visitor --> UC1
    Visitor --> UC2
    Visitor --> UC3
    Visitor --> UC4

    Client --> UC5
    Client --> UC6
    Client --> UC7
    Client --> UC8
    Client --> UC9
    Client --> UC10
    Client --> UC11
    Client --> UC12
    Client --> UC13
    Client --> UC14
    Client --> UC15

    Freelancer --> UC5
    Freelancer --> UC6
    Freelancer --> UC7
    Freelancer --> UC16
    Freelancer --> UC17
    Freelancer --> UC18
    Freelancer --> UC19
    Freelancer --> UC15

    Admin --> UC5
    Admin --> UC6
    Admin --> UC7
    Admin --> UC20
    Admin --> UC21
    Admin --> UC22
    Admin --> UC23
```

## 2. Entity Relationship Diagram (ERD)

The database consists of the following main entities and relationships.

```mermaid
erDiagram
    User ||--o{ Session : has
    User ||--o| FreelancerProfile : owns
    User ||--o| Wallet : owns
    User ||--o{ Project : creates
    User ||--o{ Proposal : submits

    Category ||--o{ Project : classifies
    Project ||--o{ Proposal : receives
    Project ||--o| Delivery : has
    Wallet ||--o{ WalletTransaction : records
    Project o|--o{ WalletTransaction : relates_to

    User {
        String id PK
        String name
        String email UK
        String password
        Role role
        Boolean isBanned
    }

    Session {
        String id PK
        String userId FK
        String refreshTokenHash
        DateTime expiresAt
        DateTime revokedAt
    }

    FreelancerProfile {
        String id PK
        String userId FK
        String bio
        String skills
        String avatar
    }

    Wallet {
        String id PK
        String userId FK
        Decimal balance
    }

    WalletTransaction {
        String id PK
        String walletId FK
        String projectId FK
        TransactionType type
        Decimal amount
    }

    Category {
        String id PK
        String name
    }

    Project {
        String id PK
        String clientId FK
        String categoryId FK
        String title
        String description
        Decimal budget
        ProjectStatus status
    }

    Proposal {
        String id PK
        String projectId FK
        String freelancerId FK
        Decimal proposedPrice
        ProposalStatus status
    }

    Delivery {
        String id PK
        String projectId FK
        String fileUrl
        String description
    }
```

### Database Enums

| Enum | Values |
|---|---|
| Role | ADMIN, CLIENT, FREELANCER |
| ProjectStatus | OPEN, IN_PROGRESS, COMPLETED |
| ProposalStatus | PENDING, ACCEPTED, REJECTED |
| TransactionType | DEPOSIT, HOLD, PAYOUT, COMMISSION |

---

## Project Structure

```text
src/
├── auth/
├── users/
├── category/
├── project/
├── proposal/
├── freelancer-profile/
├── wallet/
├── delivery/
├── prisma/
├── common/
└── main.ts

prisma/
└── schema.prisma
```

*The structure above highlights the main application modules.*

---

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js
- npm
- PostgreSQL
- Redis

### Installation

Clone the repository:

```bash
git clone https://github.com/BisherShamoun/freelancerHub.git
```

Navigate to the project directory:

```bash
cd freelancerHub
```

Install dependencies:

```bash
npm install
```

### Environment Variables

Create a `.env` file in the root directory and configure the required environment variables.

Example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/freelancerhub"

REDIS_URL="redis://localhost:6379"

JWT_ACCESS_SECRET="your_access_secret"
JWT_REFRESH_SECRET="your_refresh_secret"
```

Use the project's `.env.example` as the reference for all required variables.

### Database Setup

Generate the Prisma Client:

```bash
npx prisma generate
```

Run database migrations:

```bash
npx prisma migrate dev
```

### Run the Application

Development mode:

```bash
npm run start:dev
```

Production mode:

```bash
npm run build
npm run start:prod
```

---

## API Base URL

```text
/api
```

---

## Repository

GitHub: [BisherShamoun/freelancerHub](https://github.com/BisherShamoun/freelancerHub)

---

## License

This project is developed as part of a learning and practical backend development project.
