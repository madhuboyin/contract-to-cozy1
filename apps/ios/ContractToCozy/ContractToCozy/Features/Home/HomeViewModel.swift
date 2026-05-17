import Foundation
import Combine

@MainActor
final class HomeViewModel: ObservableObject {
    @Published var properties: [Property] = []
    @Published var selectedPropertyID: String?
    @Published var dashboard: PropertyDashboardBootstrap?
    @Published var resolutionCenter: ResolutionCenterPayload?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    var selectedProperty: Property? {
        properties.first(where: { $0.id == selectedPropertyID })
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let fetchedProperties = try await apiClient.properties()
            properties = fetchedProperties
            selectedPropertyID = selectedPropertyID ?? fetchedProperties.first?.id
            errorMessage = nil

            guard let selectedPropertyID else {
                dashboard = nil
                resolutionCenter = nil
                return
            }

            async let bootstrap = apiClient.dashboardBootstrap(propertyID: selectedPropertyID)
            async let resolutions = apiClient.resolutionCenter(propertyID: selectedPropertyID)

            dashboard = try await bootstrap
            resolutionCenter = try await resolutions
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func selectProperty(id: String) async {
        guard selectedPropertyID != id else { return }
        selectedPropertyID = id
        await load()
    }

    func reset() {
        properties = []
        selectedPropertyID = nil
        dashboard = nil
        resolutionCenter = nil
        errorMessage = nil
        isLoading = false
    }
}
