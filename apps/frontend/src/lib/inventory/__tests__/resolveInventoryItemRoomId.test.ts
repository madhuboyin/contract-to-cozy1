import { resolveInventoryItemRoomId } from '../resolveInventoryItemRoomId';

describe('resolveInventoryItemRoomId', () => {
  it('keeps the assigned room while editing an existing item', () => {
    expect(resolveInventoryItemRoomId('existing-room', 'launch-room')).toBe('existing-room');
  });

  it('preselects the launch room for a new item', () => {
    expect(resolveInventoryItemRoomId(null, 'launch-room')).toBe('launch-room');
  });

  it('leaves the room unset when there is no room context', () => {
    expect(resolveInventoryItemRoomId()).toBe('');
  });
});
