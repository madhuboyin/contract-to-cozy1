# Home Risk Replay

## Analytics events

Home Risk Replay follows the standard CtC pattern:

- frontend sends a small `{ event, section, metadata }` payload
- backend records the normalized action in `auditLog`
- stored action names are prefixed with `HOME_RISK_REPLAY_`

Current events instrumented:

- `OPENED`
  - fired once when the replay screen opens
  - key metadata: `launch_surface`, `has_property_context`, `prefilled_window_type`, `device_context`
- `GENERATION_STARTED`
  - fired when the user starts a replay run
  - key metadata: `window_type`, `custom_range_used`
- `VIEWED`
  - fired once per replay run when results render
  - key metadata: `replay_run_id`, `window_type`, `total_events_bucket`, `high_impact_events_bucket`, `moderate_impact_events_bucket`, `has_events`
- `EMPTY_VIEWED`
  - fired once per replay run when a replay renders with no matched events
  - key metadata: `replay_run_id`, `window_type`
- `EVENT_OPENED`
  - fired when a timeline event detail is opened
  - key metadata: `replay_run_id`, `replay_event_match_id`, `risk_event_id`, `event_type`, `severity`, `impact_level`, `event_position`
- `HISTORY_ITEM_OPENED`
  - fired when a prior replay run is opened from history
  - key metadata: `replay_run_id`, `window_type`, `total_events_bucket`, `high_impact_events_bucket`, `source_list_position`
- `CONTEXTUAL_ENTRY_CLICKED`
  - fired from contextual launch surfaces such as the property hub and system detail drawer
  - key metadata: `launch_surface`, `linked_system_type`, `suggested_focus_type`
- `ERROR`
  - fired for user-visible failures during open, history, detail, or generate stages
  - key metadata: `stage`, `error_type`, `window_type`, `replay_run_id`

Common metadata added on tool-screen events:

- `tool_name`
- `property_id`
- `launch_surface`
- `contextual_focus_present`
