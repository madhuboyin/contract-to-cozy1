# Database Schema Documentation
## Inspection + Handyman Categories

## 📋 Overview

This schema supports the **Contract to Cozy** platform with comprehensive database design for:
- ✅ **Inspection Services** (Home, Pest, Radon, Mold, etc.)
- ✅ **Handyman Services** (Repairs, Installation, Assembly, etc.)

**Technology Stack:**
- PostgreSQL 15
- Prisma ORM
- Full TypeScript support

---

## 🏗️ Schema Architecture

### **Core Entities**

```
User
├── HomeownerProfile
│   └── Property
└── ProviderProfile
    ├── Service
    ├── Certification
    ├── Portfolio
    └── Availability

Booking (connects Homeowner + Provider)
├── Payment
├── Document
├── Message
├── Review
└── Timeline
```

---

## 📊 Table Breakdown

### **1. User Management** (4 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Core user authentication & profile | email, role, status |
| `addresses` | User addresses with geocoding | street, city, state, lat/lng |
| `homeowner_profiles` | Homeowner-specific data | property info, budget tracking |
| `properties` | Multiple properties per homeowner | address, isPrimary |

**Design Decisions:**
- ✅ Separate roles (HOMEOWNER, PROVIDER, ADMIN) for multi-tenant support
- ✅ Email & phone verification flags for security
- ✅ Soft delete support via `status` field
- ✅ Geocoding support for distance-based matching

---

### **2. Provider Management** (5 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `provider_profiles` | Provider business information | businessName, serviceRadius, averageRating |
| `services` | Individual services offered | category, pricing, duration |
| `certifications` | License & insurance tracking | certificateNumber, expiryDate, verified |
| `provider_portfolio` | Portfolio images | imageUrl, category, description |
| `provider_availability` | Calendar availability | startDate, endDate, isAvailable |

**Design Decisions:**
- ✅ Service categories enum (INSPECTION, HANDYMAN) with specific type enums
- ✅ Flexible pricing: hourly, flat rate, per sqft
- ✅ Real-time availability tracking
- ✅ Stripe Connect integration for payments
- ✅ Separate verification flags (background check, insurance, license)

---

### **3. Service Categorization**

#### **Inspection Types** (9 services)
```typescript
HOME_INSPECTION
PEST_INSPECTION
RADON_TESTING
MOLD_INSPECTION
WELL_SEPTIC_INSPECTION
ROOF_INSPECTION
FOUNDATION_INSPECTION
ELECTRICAL_INSPECTION
PLUMBING_INSPECTION
```

#### **Handyman Types** (9 services)
```typescript
MINOR_REPAIRS
FIXTURE_INSTALLATION
FURNITURE_ASSEMBLY
DRYWALL_REPAIR
DOOR_WINDOW_REPAIR
DECK_FENCE_REPAIR
GENERAL_MAINTENANCE
PAINTING_TOUCHUP
CAULKING_SEALING
```

---

### **4. Booking System** (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `bookings` | Service requests & scheduling | status, scheduledDate, pricing |
| `booking_timeline` | Status change history | status, note, timestamp |

**Booking Status Flow:**
```
DRAFT → PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
                    ↓
                CANCELLED / DISPUTED
```

**Design Decisions:**
- ✅ Unique booking numbers (B-2025-001234)
- ✅ Separate estimated vs. final pricing
- ✅ Track actual vs. scheduled times
- ✅ Cancellation tracking (who, when, why)
- ✅ Timeline audit trail

---

### **5. Payment Management** (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `payments` | Transaction tracking | amount, status, stripePaymentIntentId |

**Payment Status Flow:**
```
PENDING → AUTHORIZED → CAPTURED
                ↓
        REFUNDED / FAILED / CANCELLED
```

**Design Decisions:**
- ✅ Deposit support (partial payments)
- ✅ Stripe integration (payment intents)
- ✅ Refund tracking
- ✅ Multiple payments per booking

---

### **6. Communication** (2 tables)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `messages` | In-app messaging | content, isRead, attachments |
| `notifications` | System notifications | type, title, actionUrl |

**Message Types:**
```typescript
TEXT              // Regular chat message
SYSTEM            // Automated message
BOOKING_UPDATE    // Status change notification
PAYMENT_UPDATE    // Payment confirmation
```

---

### **7. Reviews & Ratings** (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `reviews` | Provider reviews | rating (1-5), content, status |

**Rating Breakdown:**
- Overall rating (required)
- Quality rating (optional)
- Communication rating (optional)
- Value rating (optional)
- Professionalism rating (optional)

**Moderation Flow:**
```
PENDING → APPROVED / REJECTED / FLAGGED
```

---

### **8. Documents** (1 table)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `documents` | File storage metadata | type, fileUrl, mimeType |

**Document Types:**
```typescript
INSPECTION_REPORT
ESTIMATE
INVOICE
CONTRACT
PERMIT
PHOTO
VIDEO
INSURANCE_CERTIFICATE
LICENSE
OTHER
```

---

### **9. System Tables** (3 tables)

| Table | Purpose |
|-------|---------|
| `audit_logs` | Track all database changes |
| `system_settings` | Application configuration |
| `favorites` | User's favorite providers |

---

## 🔗 Key Relationships

### **1. User → Homeowner → Booking**
```
User (homeowner)
  └── HomeownerProfile
      └── Property
          └── Booking (requests service)
```

### **2. User → Provider → Service → Booking**
```
User (provider)
  └── ProviderProfile
      └── Service (offered)
          └── Booking (fulfills service)
```

### **3. Booking → Payment + Review**
```
Booking
  ├── Payment (1 to many)
  ├── Review (1 to 1)
  ├── Document (1 to many)
  ├── Message (1 to many)
  └── Timeline (1 to many)
```

---

## 🔍 Database Indexes

**Optimized for:**
- ✅ User lookups (email, role, status)
- ✅ Provider search (location, category, rating)
- ✅ Booking queries (status, date, homeowner, provider)
- ✅ Payment tracking (status, bookingId)
- ✅ Message history (bookingId, timestamp)
- ✅ Review filtering (providerId, rating)

---

## 💾 Sample Data Sizes

**Estimated storage (per 10,000 users):**
- Users: ~5 MB
- Bookings: ~50 MB
- Messages: ~100 MB
- Documents (metadata): ~10 MB
- Reviews: ~20 MB

**Total: ~185 MB** (excluding actual file storage)

---

## 🚀 Usage Examples

### **Create a Homeowner**
```typescript
const homeowner = await prisma.user.create({
  data: {
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'HOMEOWNER',
    passwordHash: hashedPassword,
    homeownerProfile: {
      create: {
        propertyType: 'Single Family',
        propertySize: 2500,
        closingDate: new Date('2025-03-15'),
        totalBudget: 15000
      }
    },
    address: {
      create: {
        street1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zipCode: '78701',
        latitude: 30.2672,
        longitude: -97.7431
      }
    }
  }
});
```

### **Create a Provider**
```typescript
const provider = await prisma.user.create({
  data: {
    email: 'inspector@example.com',
    firstName: 'Mike',
    lastName: 'Smith',
    role: 'PROVIDER',
    passwordHash: hashedPassword,
    providerProfile: {
      create: {
        businessName: 'Smith Home Inspections',
        serviceCategories: ['INSPECTION'],
        serviceRadius: 50,
        yearsInBusiness: 15,
        services: {
          create: [
            {
              category: 'INSPECTION',
              inspectionType: 'HOME_INSPECTION',
              name: 'Complete Home Inspection',
              description: 'Comprehensive inspection of all major systems',
              basePrice: 450,
              priceUnit: 'flat rate',
              estimatedDuration: 180
            },
            {
              category: 'INSPECTION',
              inspectionType: 'PEST_INSPECTION',
              name: 'Termite & Pest Inspection',
              description: 'Thorough pest inspection with detailed report',
              basePrice: 150,
              priceUnit: 'flat rate',
              estimatedDuration: 90
            }
          ]
        }
      }
    }
  }
});
```

### **Create a Booking**
```typescript
const booking = await prisma.booking.create({
  data: {
    bookingNumber: 'B-2025-001234',
    homeownerId: homeowner.id,
    providerId: provider.id,
    providerProfileId: provider.providerProfile.id,
    propertyId: property.id,
    serviceId: service.id,
    category: 'INSPECTION',
    status: 'PENDING',
    requestedDate: new Date('2025-03-20'),
    estimatedPrice: 450,
    description: 'Pre-purchase home inspection',
    timeline: {
      create: {
        status: 'PENDING',
        note: 'Booking created',
        createdBy: homeowner.id
      }
    }
  }
});
```

### **Search Providers by Location & Service**
```typescript
const providers = await prisma.providerProfile.findMany({
  where: {
    status: 'ACTIVE',
    serviceCategories: {
      has: 'INSPECTION'
    },
    services: {
      some: {
        inspectionType: 'HOME_INSPECTION',
        isActive: true
      }
    }
  },
  include: {
    user: {
      include: {
        address: true
      }
    },
    services: true
  },
  orderBy: {
    averageRating: 'desc'
  }
});

// Filter by distance (application logic)
const nearby = providers.filter(p => {
  const distance = calculateDistance(
    userLat, userLng,
    p.user.address.latitude,
    p.user.address.longitude
  );
  return distance <= p.serviceRadius;
});
```

---

## 🛡️ Security Features

- ✅ **Cascade deletes** for data integrity
- ✅ **Unique constraints** on emails, booking numbers
- ✅ **Enum validation** for status fields
- ✅ **Audit logging** for sensitive operations
- ✅ **Soft delete** support via status fields
- ✅ **Email/phone verification** flags
- ✅ **Provider verification** (background, insurance, license)

---

## 📈 Scalability Considerations

- ✅ Indexed foreign keys for fast joins
- ✅ Separate timeline table to avoid booking table bloat
- ✅ JSON fields for flexible metadata
- ✅ Prepared for read replicas (no triggers/procedures)
- ✅ Partitioning-ready (by date fields)

---

## 🎯 Next Steps

1. **Apply Migration:**
   ```bash
   cd apps/backend
   npx prisma migrate dev --name init_inspection_handyman
   npx prisma generate
   ```

2. **Seed Database:**
   ```bash
   npm run seed
   ```

3. **API Development:**
   - User authentication endpoints
   - Provider search & filtering
   - Booking management
   - Payment processing
   - Messaging system

---

## 📞 Support

For schema questions or modifications:
- Review: `ARCHITECTURE_DESIGN.md`
- Issues: Create GitHub issue with `database` label
- Contact: dev@contracttocozy.com
