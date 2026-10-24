-- Remove ordinary ASCII spaces from voucher usernames in the database only.
-- Scope is defined by um_vouchers_meta; subscriber/router usernames are not selected.
-- Run with: mariadb --default-character-set=utf8mb4 radius < normalize_voucher_usernames_spaces.sql
-- Take a database backup first and run while affected vouchers have no active RADIUS sessions.
-- Passwords and card printouts are intentionally not changed.

USE radius;

DROP PROCEDURE IF EXISTS sam_normalize_voucher_spaces_20261009;
DELIMITER //
CREATE PROCEDURE sam_normalize_voucher_spaces_20261009()
BEGIN
    DECLARE affected_cards BIGINT DEFAULT 0;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        DROP TEMPORARY TABLE IF EXISTS sam_voucher_name_map;
        RESIGNAL;
    END;

    START TRANSACTION;
    DROP TEMPORARY TABLE IF EXISTS sam_voucher_name_map;
    CREATE TEMPORARY TABLE sam_voucher_name_map ENGINE=InnoDB AS
        SELECT DISTINCT username AS old_username,
                        REPLACE(username, ' ', '') AS new_username
        FROM um_vouchers_meta
        WHERE BINARY username <> BINARY REPLACE(username, ' ', '');

    SELECT COUNT(*) INTO affected_cards FROM sam_voucher_name_map;

    IF EXISTS (SELECT 1 FROM sam_voucher_name_map WHERE new_username = '') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Voucher username would become empty';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sam_voucher_name_map
        GROUP BY new_username HAVING COUNT(*) > 1
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Multiple voucher usernames would become identical';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN um_vouchers_meta v ON v.username = m.new_username
        WHERE BINARY v.username <> BINARY m.old_username
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN radcheck r ON r.username = m.new_username
        WHERE BINARY r.username <> BINARY m.old_username
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN radusergroup g ON g.username = m.new_username
        WHERE BINARY g.username <> BINARY m.old_username
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN radreply r ON r.username = m.new_username
        WHERE BINARY r.username <> BINARY m.old_username
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN um_users u ON u.username IN (m.old_username, m.new_username)
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN um_customers c ON c.username IN (m.old_username, m.new_username)
    ) OR EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN um_admins a ON a.username IN (m.old_username, m.new_username)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Normalized voucher username conflicts with an existing account';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sam_voucher_name_map m
        JOIN radacct a ON BINARY a.username = BINARY m.old_username
        WHERE a.acctstoptime IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An affected voucher has an active RADIUS session';
    END IF;

    UPDATE radcheck r JOIN sam_voucher_name_map m
        ON BINARY r.username = BINARY m.old_username
        SET r.username = m.new_username;
    UPDATE radreply r JOIN sam_voucher_name_map m
        ON BINARY r.username = BINARY m.old_username
        SET r.username = m.new_username;
    UPDATE radusergroup g JOIN sam_voucher_name_map m
        ON BINARY g.username = BINARY m.old_username
        SET g.username = m.new_username;
    UPDATE radacct a JOIN sam_voucher_name_map m
        ON BINARY a.username = BINARY m.old_username
        SET a.username = m.new_username;
    UPDATE radpostauth p JOIN sam_voucher_name_map m
        ON BINARY p.username = BINARY m.old_username
        SET p.username = m.new_username;
    UPDATE um_vouchers_meta v JOIN sam_voucher_name_map m
        ON BINARY v.username = BINARY m.old_username
        SET v.username = m.new_username;

    COMMIT;
    SELECT affected_cards AS normalized_voucher_usernames;
    DROP TEMPORARY TABLE sam_voucher_name_map;
END//
DELIMITER ;

CALL sam_normalize_voucher_spaces_20261009();
DROP PROCEDURE sam_normalize_voucher_spaces_20261009;
