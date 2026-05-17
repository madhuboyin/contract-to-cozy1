import Foundation

enum ContractToCozyAPIError: LocalizedError {
    case invalidResponse
    case missingData
    case unauthorized
    case mfaRequired
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "The server returned an invalid response."
        case .missingData:
            return "The response was missing expected data."
        case .unauthorized:
            return "Your session expired. Please sign in again."
        case .mfaRequired:
            return "This first iOS cut does not support MFA verification yet."
        case .server(let message):
            return message
        }
    }
}

final class APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var csrfToken: String?

    init(baseURL: URL) {
        self.baseURL = baseURL

        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 12
        configuration.timeoutIntervalForResource = 20

        self.session = URLSession(configuration: configuration)
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
    }

    func signIn(email: String, password: String) async throws -> User {
        let payload = LoginRequest(email: email, password: password)
        let response: LoginResponse = try await request(
            path: "/api/auth/login",
            method: "POST",
            body: payload
        )

        if response.mfaRequired == true {
            throw ContractToCozyAPIError.mfaRequired
        }

        guard let user = response.user else {
            throw ContractToCozyAPIError.missingData
        }

        return user
    }

    func currentUser() async throws -> User {
        try await request(path: "/api/auth/me")
    }

    func signOut() async {
        do {
            let _: EmptyResponse = try await request(path: "/api/auth/logout", method: "POST")
        } catch {
            // Swallow logout errors so the UI can still reset locally.
        }
    }

    func properties() async throws -> [Property] {
        let payload: PropertiesResponse = try await request(path: "/api/properties")
        return payload.properties
    }

    func dashboardBootstrap(propertyID: String) async throws -> PropertyDashboardBootstrap {
        try await request(path: "/api/properties/\(propertyID)/dashboard-bootstrap")
    }

    func resolutionCenter(propertyID: String) async throws -> ResolutionCenterPayload {
        try await request(path: "/api/properties/\(propertyID)/resolution-center")
    }

    private func request<Body: Encodable, Value: Decodable>(
        path: String,
        method: String,
        body: Body
    ) async throws -> Value {
        var request = try await makeRequest(path: path, method: method)
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    private func request<Value: Decodable>(
        path: String,
        method: String = "GET"
    ) async throws -> Value {
        let request = try await makeRequest(path: path, method: method)
        return try await send(request)
    }

    private func makeRequest(path: String, method: String) async throws -> URLRequest {
        let url = baseURL.appendingPathComponent(path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if method != "GET" && method != "HEAD" && method != "OPTIONS" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let token = try await fetchCSRFToken()
            request.setValue(token, forHTTPHeaderField: "X-CSRF-Token")
        }

        return request
    }

    private func fetchCSRFToken() async throws -> String {
        if let csrfToken {
            return csrfToken
        }

        let url = baseURL.appendingPathComponent("api/csrf-token")
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            throw ContractToCozyAPIError.invalidResponse
        }

        let payload = try decoder.decode(CSRFTokenResponse.self, from: data)
        csrfToken = payload.csrfToken
        return payload.csrfToken
    }

    private func send<Value: Decodable>(_ request: URLRequest) async throws -> Value {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ContractToCozyAPIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw ContractToCozyAPIError.unauthorized
        }

        let envelope = try decoder.decode(APIEnvelope<Value>.self, from: data)

        if envelope.success, let payload = envelope.data {
            return payload
        }

        if httpResponse.statusCode == 401 {
            throw ContractToCozyAPIError.unauthorized
        }

        let message = envelope.error?.message ?? envelope.message ?? "Something went wrong."
        throw ContractToCozyAPIError.server(message)
    }
}
