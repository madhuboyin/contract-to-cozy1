# ContractToCozy iOS Deployment

This guide covers how to take the native iOS app in `apps/ios/ContractToCozy` from local development to a TestFlight or App Store release.

## 1. Prerequisites

- Apple Developer Program membership with access to App Store Connect
- Xcode installed on a Mac
- A unique production bundle identifier
- Access to the production ContractToCozy backend
- Release owner access to signing certificates and provisioning profiles

## 2. Confirm the Current App Scope

The current native app includes:

- Homeowner sign-in
- Session restore using the existing backend cookie/session flow
- Property picker
- Property dashboard bootstrap
- Resolution center urgent actions

Known limitation in the current cut:

- MFA challenge completion is not yet implemented in-app

Do not ship to production until you are comfortable with that limitation or have implemented MFA support.

## 3. Set Production App Identity

Open the Xcode project:

- `apps/ios/ContractToCozy/ContractToCozy.xcodeproj`

In the `ContractToCozy` target, update:

- `Bundle Identifier`
- `Display Name` if needed
- `Version`
- `Build`

Recommended production bundle ID format:

- `com.contracttocozy.app`

## 4. Environment Configuration

The app now reads its backend base URL from `CTCAPIBaseURL` in:

- `apps/ios/ContractToCozy/ContractToCozy/Info.plist`

That value is injected through environment-specific `.xcconfig` files:

- `apps/ios/ContractToCozy/ContractToCozy/Config/Debug.xcconfig`
- `apps/ios/ContractToCozy/ContractToCozy/Config/Release.xcconfig`

Current defaults:

- `Debug` -> `http://localhost:8080`
- `Release` -> `https://api.contracttocozy.com`

Current bundle IDs:

- `Debug` -> `com.contracttocozy.ios.dev`
- `Release` -> `com.contracttocozy.app`

If your production API or final bundle ID changes, update the `.xcconfig` files instead of editing `Info.plist` directly.

Recommended workflow:

1. Keep `Debug` on local or staging backend.
2. Keep `Release` on production backend.
3. Make all environment changes in `.xcconfig`.
4. Archive only after confirming the active configuration is `Release`.

## 5. Review Transport and Security Settings

Before release, verify:

- ATS settings in `Info.plist` are appropriate for production
- Production API uses HTTPS
- Any local-network exceptions are only present if still required

Current note:

- `NSAllowsLocalNetworking` is enabled to support local development in `Debug`

For production, keep the app on HTTPS endpoints and review whether this exception should remain in the release plist configuration.

## 6. Configure Signing

In Xcode:

1. Select the `ContractToCozy` target.
2. Open `Signing & Capabilities`.
3. Choose the correct Apple Developer team.
4. Enable `Automatically manage signing` unless your release process requires manual profiles.
5. Confirm the bundle identifier matches the App ID in Apple Developer.

If you plan to use capabilities later, add them before first production submission:

- Push Notifications
- Associated Domains
- Sign in with Apple
- Keychain Sharing

None of those are required by the current app code yet.

## 7. Create the App in App Store Connect

In App Store Connect:

1. Create a new iOS app record.
2. Match the bundle identifier exactly.
3. Set the primary language, app name, and SKU.
4. Prepare:
   `Privacy Policy URL`
   `Support URL`
   `Marketing URL` if available

Also prepare App Privacy answers based on the live backend behavior and any analytics you enable.

## 8. Add Release Assets

Before TestFlight or App Store submission, prepare:

- App icon set
- Launch and marketing screenshots
- App description
- Keywords
- Support contact
- Privacy nutrition labels

Current project note:

- The project includes a minimal asset catalog only
- Final branded icons and screenshots still need to be added

## 9. Run Pre-Release Checks

Before archiving, verify:

1. The `Release.xcconfig` backend URL is correct.
2. The app signs in successfully against the intended environment.
3. Property loading works for a real homeowner account.
4. Resolution center data renders correctly.
5. Sign-out works.
6. Failure behavior is acceptable when the API is unavailable.
7. MFA expectations are documented for testers.

Recommended device coverage:

- iPhone 11
- iPhone 13 or 14
- A current Pro or Pro Max device

Recommended iOS coverage:

- Minimum supported version: iOS 15
- Latest public iOS version

## 10. Archive the App

In Xcode:

1. Select the `ContractToCozy` scheme.
2. Switch to `Any iOS Device (arm64)`.
3. Choose `Product` > `Archive`.
4. Wait for the archive to appear in Organizer.

If archive fails, check:

- Signing configuration
- Bundle identifier mismatch
- Missing production assets
- Release URL/configuration issues

## 11. Upload to TestFlight

From Organizer:

1. Select the latest archive.
2. Click `Distribute App`.
3. Choose `App Store Connect`.
4. Choose `Upload`.
5. Keep symbol upload enabled.
6. Complete validation and upload.

After upload:

1. Wait for App Store Connect processing.
2. Add internal testers first.
3. Share release notes that mention:
   - homeowner-only scope
   - current MFA limitation
   - supported OS/device range

## 12. Promote to External Testing or App Review

For external TestFlight:

1. Complete beta app information.
2. Add test notes.
3. Submit for Beta App Review if required.

For App Store release:

1. Complete metadata and screenshots.
2. Complete compliance and privacy answers.
3. Attach the build to the app version.
4. Submit for review.

## 13. Recommended Hardening Before Production

Before public launch, strongly consider these follow-up tasks:

1. Implement MFA challenge and recovery flow in-app.
2. Move `CTCAPIBaseURL` to environment-specific build configuration.
3. Add production app icons and branded launch assets.
4. Add crash reporting and release logging.
5. Add a small smoke-test checklist for each archive.
6. Add UI tests for sign-in and dashboard load.
7. Validate cookie/session behavior against production infrastructure.

## 14. Suggested Release Checklist

Use this checklist for each deployment:

- Version and build number updated
- Release backend URL confirmed
- Signing confirmed
- Archive succeeds
- TestFlight upload succeeds
- Internal QA sign-in passes
- Property dashboard passes
- Urgent actions render correctly
- Logout passes
- Release notes updated
- MFA limitation communicated

## 15. Important Files

- Project: `apps/ios/ContractToCozy/ContractToCozy.xcodeproj`
- App entry: `apps/ios/ContractToCozy/ContractToCozy/ContractToCozyApp.swift`
- API config: `apps/ios/ContractToCozy/ContractToCozy/Info.plist`
- Debug config: `apps/ios/ContractToCozy/ContractToCozy/Config/Debug.xcconfig`
- Release config: `apps/ios/ContractToCozy/ContractToCozy/Config/Release.xcconfig`
- API client: `apps/ios/ContractToCozy/ContractToCozy/Services/APIClient.swift`
