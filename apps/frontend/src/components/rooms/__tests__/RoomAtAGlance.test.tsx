import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RoomAtAGlance from '../RoomAtAGlance';

describe('RoomAtAGlance', () => {
  it('presents a dedicated add-item action', async () => {
    const onAddItem = jest.fn();

    render(
      <RoomAtAGlance
        itemCount={1}
        gapCount={0}
        docCount={0}
        valueCount={1}
        onEditProfile={jest.fn()}
        onAddItem={onAddItem}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add / manage items' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onAddItem).toHaveBeenCalledTimes(1);
  });
});
