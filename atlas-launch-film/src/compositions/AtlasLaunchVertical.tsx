import React from 'react';
import { AtlasLaunch, type AtlasLaunchProps } from './AtlasLaunch';

/**
 * 9:16 edition. Scenes detect the portrait frame via useLayout() and
 * recompose typography, panels, graph topology and camera framing for
 * Reels safe areas (key content between y≈250 and y≈1500).
 */
export const AtlasLaunchVertical: React.FC<AtlasLaunchProps> = (props) => <AtlasLaunch {...props} />;
