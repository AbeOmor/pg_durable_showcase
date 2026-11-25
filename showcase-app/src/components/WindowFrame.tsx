import React from 'react';
import { Badge, Window } from '../kit';

interface WindowFrameProps {
  title: string;
  urlPill?: string;
  rightSlot?: React.ReactNode;
  hero?: boolean;
  children: React.ReactNode;
}

// Host app windows use the stageshow kit's Window so chrome matches the scripted stages.
export const WindowFrame: React.FC<WindowFrameProps> = ({
  title,
  urlPill,
  rightSlot,
  hero = false,
  children,
}) => (
  <Window
    title={title}
    className={`pg-window${hero ? ' pg-window--hero' : ''}`}
    toolbar={
      urlPill || rightSlot ? (
        <span className="pg-window-tools">
          {urlPill && <Badge className="mono">{urlPill}</Badge>}
          {rightSlot}
        </span>
      ) : undefined
    }
    body={{ className: 'pg-window-body' }}
  >
    {children}
  </Window>
);
