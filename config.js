 const path = require('path');

module.exports = {
  ADSPOWER_API_PORT: 50325,

  MAPPING_FILE: path.join(__dirname, 'mapping.json'),
  TARGETS_DIR: path.join(__dirname, 'targets', 'targets(filtered)'),
  FOLLOW_LOG: path.join(__dirname, 'logs', 'followed.json'),

  DEFAULT_GROUP_FILE: 'group01.txt',

  SEARCH_INPUT_SELECTOR: 'input._aaie._abeh._aaic._ag7n[placeholder="Search"]',
  SEARCH_ICON_HREF: '/explore/',
  HOME_HREF: '/',
};
