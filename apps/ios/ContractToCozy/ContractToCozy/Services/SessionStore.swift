import Foundation
import Combine

@MainActor
final class SessionStore: ObservableObject {
    enum AuthState: Equatable {
        case checking
        case signedOut
        case signedIn(User)
    }

    @Published var authState: AuthState = .checking
    @Published var errorMessage: String?
    @Published var isSubmitting = false

    let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    var user: User? {
        if case .signedIn(let user) = authState {
            return user
        }

        return nil
    }

    func restoreSession() async {
        do {
            let user = try await apiClient.currentUser()
            authState = .signedIn(user)
            errorMessage = nil
        } catch {
            authState = .signedOut
        }
    }

    func signIn(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter both your email and password."
            return
        }

        isSubmitting = true
        defer { isSubmitting = false }

        do {
            let user = try await apiClient.signIn(email: email, password: password)
            authState = .signedIn(user)
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            authState = .signedOut
        }
    }

    func signOut() async {
        await apiClient.signOut()
        authState = .signedOut
        errorMessage = nil
    }
}
