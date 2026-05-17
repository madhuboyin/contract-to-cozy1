import SwiftUI

struct HomeDashboardView: View {
    @ObservedObject var homeViewModel: HomeViewModel

    private var healthScore: Int {
        homeViewModel.dashboard?.property.healthScore.totalScore ?? 0
    }

    private var narrativeBlocks: [PropertyNarrativeBlock] {
        homeViewModel.dashboard?.narrativeRun?.payloadJson.blocks ?? []
    }

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.98, green: 0.95, blue: 0.90),
                        Color(red: 0.95, green: 0.98, blue: 0.95)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        propertyPicker

                        if let errorMessage = homeViewModel.errorMessage {
                            SurfaceCard {
                                Text(errorMessage)
                                    .foregroundStyle(.red)
                            }
                        }

                        if homeViewModel.isLoading && homeViewModel.dashboard == nil {
                            ProgressView("Loading your property intelligence...")
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, 40)
                        } else if let dashboard = homeViewModel.dashboard {
                            scoreSummary(for: dashboard)
                            onboardingSummary(for: dashboard.onboarding)
                            narrativeSummary
                            urgentActions
                        } else {
                            emptyState
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
        }
        .navigationViewStyle(.stack)
        .task {
            if homeViewModel.properties.isEmpty && !homeViewModel.isLoading {
                await homeViewModel.load()
            }
        }
        .refreshable {
            await homeViewModel.load()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your home, translated into decisions.")
                .font(.system(size: 30, weight: .bold, design: .rounded))

            Text("Track property health, onboarding progress, and the next actions that matter right now.")
                .font(.body)
                .foregroundStyle(.secondary)
        }
    }

    private var propertyPicker: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Property")
                    .font(.headline)

                if homeViewModel.properties.isEmpty {
                    Text("No properties found on this account yet.")
                        .foregroundStyle(.secondary)
                } else {
                    Picker("Property", selection: propertySelection) {
                        ForEach(homeViewModel.properties) { property in
                            Text(property.name ?? property.address).tag(property.id)
                        }
                    }
                    .pickerStyle(.menu)

                    if let selectedProperty = homeViewModel.selectedProperty {
                        Text("\(selectedProperty.address), \(selectedProperty.city), \(selectedProperty.state)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var propertySelection: Binding<String> {
        Binding(
            get: { homeViewModel.selectedPropertyID ?? "" },
            set: { newValue in
                Task {
                    await homeViewModel.selectProperty(id: newValue)
                }
            }
        )
    }

    private func scoreSummary(for dashboard: PropertyDashboardBootstrap) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(dashboard.property.name ?? "Primary property")
                            .font(.title3.weight(.semibold))
                        Text("Health Score")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text("\(healthScore)")
                        .font(.system(size: 46, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.accentColor)
                }

                HStack(spacing: 12) {
                    metricPill(label: "Setup score", value: "\(dashboard.onboarding.setupScore)")
                    metricPill(label: "Open cases", value: "\(homeViewModel.resolutionCenter?.counts.openCases ?? 0)")
                    metricPill(label: "Incidents", value: "\(homeViewModel.resolutionCenter?.counts.activeIncidents ?? 0)")
                }

                if let topInsight = dashboard.property.healthScore.insights.first {
                    Text("Top signal: \(topInsight.factor) is marked \(topInsight.status.lowercased()) with a score impact of \(topInsight.score).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func onboardingSummary(for onboarding: PropertyOnboardingNarrativeState) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Onboarding momentum")
                    .font(.headline)

                ProgressView(value: Double(onboarding.currentStep), total: 5)
                    .tint(.accentColor)

                Text("Step \(onboarding.currentStep) of 5. Recommended next step: \(onboarding.recommendedNextStep).")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                ForEach(onboarding.steps.prefix(3)) { step in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: step.complete ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(step.complete ? Color.accentColor : .secondary)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(step.title)
                                .font(.subheadline.weight(.semibold))
                            Text(step.description)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var narrativeSummary: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Narrative brief")
                    .font(.headline)

                if narrativeBlocks.isEmpty {
                    Text("Narrative guidance will appear here once the backend has an active property story ready.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(narrativeBlocks.prefix(3)) { block in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(block.title ?? readableBlockTitle(block.type))
                                .font(.subheadline.weight(.semibold))
                            if let body = block.body, !body.isEmpty {
                                Text(body)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            if let bullet = block.bullets?.first {
                                Text("• \(bullet)")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var urgentActions: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("Urgent actions")
                    .font(.headline)

                if let urgentActions = homeViewModel.resolutionCenter?.urgentActions, !urgentActions.isEmpty {
                    ForEach(urgentActions.prefix(5)) { action in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(action.title)
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                if let severity = action.severity {
                                    Text(severity.capitalized)
                                        .font(.caption.weight(.semibold))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(severityColor(severity).opacity(0.14), in: Capsule())
                                        .foregroundStyle(severityColor(severity))
                                }
                            }
                            Text(action.description)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            if let dueDate = action.dueDate {
                                Text("Due \(formattedDate(dueDate))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } else {
                    Text("No urgent actions are currently flagged for this property.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var emptyState: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("No property selected")
                    .font(.headline)
                Text("This first iOS version assumes the homeowner account already has at least one property in ContractToCozy.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func metricPill(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.headline.weight(.semibold))
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func readableBlockTitle(_ value: String) -> String {
        value
            .lowercased()
            .split(separator: "_")
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    private func severityColor(_ value: String) -> Color {
        switch value.uppercased() {
        case "CRITICAL":
            return .red
        case "WARNING":
            return .orange
        default:
            return .blue
        }
    }

    private func formattedDate(_ value: String) -> String {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: value) {
            return date.formatted(date: .abbreviated, time: .omitted)
        }

        return value
    }
}
