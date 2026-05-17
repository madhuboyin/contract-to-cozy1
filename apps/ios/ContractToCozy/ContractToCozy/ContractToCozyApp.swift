import SwiftUI

@main
struct ContractToCozyApp: App {
    @StateObject private var sessionStore: SessionStore
    @StateObject private var homeViewModel: HomeViewModel

    init() {
        let baseURL = Bundle.main.object(forInfoDictionaryKey: "CTCAPIBaseURL") as? String ?? "http://localhost:8080"
        let apiClient = APIClient(baseURL: URL(string: baseURL)!)
        _sessionStore = StateObject(wrappedValue: SessionStore(apiClient: apiClient))
        _homeViewModel = StateObject(wrappedValue: HomeViewModel(apiClient: apiClient))
    }

    var body: some Scene {
        WindowGroup {
            AppRootView(sessionStore: sessionStore, homeViewModel: homeViewModel)
        }
    }
}
