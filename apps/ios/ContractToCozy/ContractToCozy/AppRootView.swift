import SwiftUI

struct AppRootView: View {
    @ObservedObject var sessionStore: SessionStore
    @ObservedObject var homeViewModel: HomeViewModel

    var body: some View {
        Group {
            switch sessionStore.authState {
            case .checking:
                ProgressView("Checking your session...")
                    .task {
                        await sessionStore.restoreSession()
                    }
            case .signedOut:
                LoginView(sessionStore: sessionStore)
            case .signedIn:
                TabView {
                    HomeDashboardView(homeViewModel: homeViewModel)
                        .tabItem {
                            Label("Home", systemImage: "house.fill")
                        }

                    AccountView(sessionStore: sessionStore, homeViewModel: homeViewModel)
                        .tabItem {
                            Label("Account", systemImage: "person.crop.circle")
                        }
                }
            }
        }
    }
}
