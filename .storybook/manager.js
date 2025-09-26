import { themes } from '@storybook/theming';
import { addons } from '@storybook/addons';

addons.setConfig({
  theme: {
    ...themes.dark,
    brandImage: './icon.svg',
    brandTitle: 'Sajjin Nijjar Components',
    brandUrl: 'https://sajjinnijjar.com',
  },
});
