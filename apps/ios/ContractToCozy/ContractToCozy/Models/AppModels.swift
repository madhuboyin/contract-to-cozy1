import Foundation

struct APIEnvelope<Value: Decodable>: Decodable {
    let success: Bool
    let data: Value?
    let message: String?
    let error: APIErrorPayload?
}

struct APIErrorPayload: Decodable {
    let message: String?
    let code: String?
}

struct EmptyResponse: Decodable {}

struct CSRFTokenResponse: Decodable {
    let csrfToken: String
}

struct User: Codable, Equatable, Identifiable {
    enum Role: String, Codable {
        case homeowner = "HOMEOWNER"
        case provider = "PROVIDER"
        case admin = "ADMIN"
    }

    let id: String
    let firstName: String
    let lastName: String
    let email: String
    let role: Role
    let segment: String?

    var displayName: String {
        "\(firstName) \(lastName)"
    }
}

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let sessionEstablished: Bool?
    let user: User?
    let mfaRequired: Bool?
    let mfaToken: String?
}

struct Property: Codable, Equatable, Identifiable {
    let id: String
    let homeownerProfileId: String?
    let name: String?
    let address: String
    let city: String
    let state: String
    let zipCode: String
    let isPrimary: Bool
    let propertyType: String?
    let propertySize: Double?
    let yearBuilt: Int?
    let bedrooms: Double?
    let bathrooms: Double?
}

struct HealthInsight: Codable, Equatable, Identifiable {
    var id: String { factor }

    let factor: String
    let status: String
    let score: Int
    let details: [String]?
}

struct HealthScoreResult: Codable, Equatable {
    let totalScore: Int
    let baseScore: Int
    let unlockedScore: Int
    let maxPotentialScore: Int
    let maxBaseScore: Int
    let maxExtraScore: Int
    let insights: [HealthInsight]
    let ctaNeeded: Bool
}

struct ScoredProperty: Codable, Equatable, Identifiable {
    let id: String
    let homeownerProfileId: String?
    let name: String?
    let address: String
    let city: String
    let state: String
    let zipCode: String
    let isPrimary: Bool
    let propertyType: String?
    let propertySize: Double?
    let yearBuilt: Int?
    let bedrooms: Double?
    let bathrooms: Double?
    let healthScore: HealthScoreResult
}

struct OnboardingStep: Codable, Equatable, Identifiable {
    var id: Int { step }

    let step: Int
    let title: String
    let description: String
    let complete: Bool
    let ctaLabel: String
    let href: String
}

struct PropertyOnboardingNarrativeState: Codable, Equatable {
    let propertyId: String
    let status: String
    let currentStep: Int
    let dismissedAt: String?
    let setupScore: Int
    let steps: [OnboardingStep]
    let recommendedNextStep: Int
}

struct PropertyNarrativeCTA: Codable, Equatable, Identifiable {
    var id: String { key }

    let key: String
    let label: String
    let action: String
}

struct PropertyNarrativeBlock: Codable, Equatable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let body: String?
    let bullets: [String]?
    let ctas: [PropertyNarrativeCTA]?
}

struct PropertyNarrativeMetadata: Codable, Equatable {
    let runVersion: String
    let confidenceScore: Double
    let propertyId: String
    let computedAt: String
    let heroVariant: String
}

struct PropertyNarrativePayload: Codable, Equatable {
    let metadata: PropertyNarrativeMetadata
    let blocks: [PropertyNarrativeBlock]
}

struct PropertyNarrativeRun: Codable, Equatable, Identifiable {
    let id: String
    let propertyId: String
    let userId: String
    let version: String
    let status: String
    let payloadJson: PropertyNarrativePayload
    let startedAt: String
    let completedAt: String?
    let dismissedAt: String?
    let expiresAt: String?
    let createdAt: String
    let updatedAt: String
}

struct PropertyDashboardBootstrap: Codable, Equatable {
    let property: ScoredProperty
    let onboarding: PropertyOnboardingNarrativeState
    let narrativeRun: PropertyNarrativeRun?
}

struct ResolutionCenterAction: Codable, Equatable, Identifiable {
    let id: String
    let type: String
    let title: String
    let description: String
    let dueDate: String?
    let daysUntilDue: Int?
    let propertyId: String
    let severity: String?
    let entityType: String?
    let itemId: String?
    let status: String?
}

struct ResolutionCenterCounts: Codable, Equatable {
    let openCases: Int
    let decisionsReady: Int
    let activeBookings: Int
    let activeIncidents: Int
}

struct ResolutionCenterPayload: Codable, Equatable {
    let urgentActions: [ResolutionCenterAction]
    let counts: ResolutionCenterCounts
}

struct PropertiesResponse: Decodable {
    let properties: [Property]
}
