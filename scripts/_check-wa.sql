SELECT `key`, `value` FROM settings WHERE `key` LIKE 'wa.feature.%' OR `key` = 'wa.enabled' OR `key` = 'wa.linkedJid';
