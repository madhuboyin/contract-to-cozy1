import SwiftUI

struct LoginView: View {
    @ObservedObject var sessionStore: SessionStore

    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.96, green: 0.91, blue: 0.83),
                    Color(red: 0.93, green: 0.97, blue: 0.94),
                    Color(red: 0.88, green: 0.93, blue: 0.97)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Contract to Cozy")
                            .font(.system(size: 34, weight: .bold, design: .rounded))

                        Text("A calm homeowner cockpit for property health, savings, and next best actions.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 28)

                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 18) {
                            Text("Sign in")
                                .font(.title2.weight(.semibold))

                            TextField("Email", text: $email)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.emailAddress)
                                .padding()
                                .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                            SecureField("Password", text: $password)
                                .padding()
                                .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                            if let errorMessage = sessionStore.errorMessage {
                                Text(errorMessage)
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                            }

                            Button {
                                Task {
                                    await sessionStore.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
                                }
                            } label: {
                                HStack {
                                    if sessionStore.isSubmitting {
                                        ProgressView()
                                            .progressViewStyle(.circular)
                                            .tint(.white)
                                    }
                                    Text(sessionStore.isSubmitting ? "Signing in..." : "Open my home dashboard")
                                        .fontWeight(.semibold)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.accentColor)
                            .disabled(sessionStore.isSubmitting)

                            VStack(alignment: .leading, spacing: 8) {
                                Label("First native release", systemImage: "iphone.gen3")
                                Label("Homeowner sign-in, property overview, and urgent actions", systemImage: "checkmark.seal")
                                Label("Uses the existing ContractToCozy backend session and API", systemImage: "network")
                            }
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
        }
    }
}
