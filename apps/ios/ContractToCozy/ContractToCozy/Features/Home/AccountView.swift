import SwiftUI

struct AccountView: View {
    @ObservedObject var sessionStore: SessionStore
    @ObservedObject var homeViewModel: HomeViewModel

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.94, green: 0.96, blue: 0.99),
                        Color(red: 0.92, green: 0.98, blue: 0.95)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        if let user = sessionStore.user {
                            SurfaceCard {
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(user.displayName)
                                        .font(.title2.weight(.semibold))
                                    Text(user.email)
                                        .foregroundStyle(.secondary)
                                    Text("Role: \(user.role.rawValue)")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }

                        SurfaceCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Native app scope")
                                    .font(.headline)
                                Text("This build focuses on homeowner authentication, property selection, dashboard bootstrap, and the resolution center summary.")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Button(role: .destructive) {
                            Task {
                                await sessionStore.signOut()
                                homeViewModel.reset()
                            }
                        } label: {
                            Text("Sign out")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack)
    }
}
