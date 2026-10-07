<?php
declare(strict_types=1);

/**
 * Unified loader for central AuthorizationContext.
 * Points to the canonical definition in api/v1/lib/AuthorizationContext.php to prevent class re-declaration.
 */
require_once __DIR__ . '/../api/v1/lib/AuthorizationContext.php';
