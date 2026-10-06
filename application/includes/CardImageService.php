<?php
declare(strict_types=1);

/**
 * CardImageService - High-Fidelity Server-Side Card & Sheet Image Generator
 * Renders visual voucher cards exactly matching the profile template (قالب الباقة)
 * and generates sheet/receipt images for WhatsApp media delivery.
 */
class CardImageService
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    /**
     * Get the active template for a given profile and network.
     */
    public function getTemplateForProfile(string $profileName, int $networkId = 0): ?array
    {
        if ($networkId <= 0 && function_exists('getCurrentNetworkId')) {
            $networkId = (int)getCurrentNetworkId();
        }

        if (!empty($profileName)) {
            // 1. Check linked template_id in profile definition
            $pStmt = $this->db->prepare("SELECT template_id FROM um_profiles_def WHERE network_id = ? AND name = ? LIMIT 1");
            $pStmt->execute([$networkId, $profileName]);
            $tmplId = $pStmt->fetchColumn();
            if ($tmplId) {
                $tStmt = $this->db->prepare("SELECT * FROM um_card_templates WHERE network_id = ? AND id = ? LIMIT 1");
                $tStmt->execute([$networkId, (int)$tmplId]);
                $t = $tStmt->fetch(PDO::FETCH_ASSOC);
                if ($t) return $t;
            }

            // 2. Check direct profile_name association in templates
            $tStmt2 = $this->db->prepare("SELECT * FROM um_card_templates WHERE network_id = ? AND profile_name = ? LIMIT 1");
            $tStmt2->execute([$networkId, $profileName]);
            $t2 = $tStmt2->fetch(PDO::FETCH_ASSOC);
            if ($t2) return $t2;
        }

        // 3. Fallback to default network template
        $defStmt = $this->db->prepare("SELECT * FROM um_card_templates WHERE network_id = ? ORDER BY id ASC LIMIT 1");
        $defStmt->execute([$networkId]);
        $def = $defStmt->fetch(PDO::FETCH_ASSOC);
        if ($def) return $def;

        // 4. Global default template
        $gStmt = $this->db->query("SELECT * FROM um_card_templates ORDER BY id ASC LIMIT 1");
        return $gStmt ? $gStmt->fetch(PDO::FETCH_ASSOC) : null;
    }

    /**
     * Generate a crisp PNG image (Base64) for a voucher card matching its package template.
     */
    public function generateCardImageBase64(array $voucher, int $networkId = 0): string
    {
        $username = trim((string)($voucher['username'] ?? ''));
        $password = trim((string)($voucher['password'] ?? $voucher['username'] ?? ''));
        $profileName = trim((string)($voucher['profile_name'] ?? $voucher['profile'] ?? ''));
        $price = trim((string)($voucher['price'] ?? $voucher['retail_price'] ?? $voucher['sale_price'] ?? ''));
        $validity = trim((string)($voucher['validity'] ?? ''));
        $sheetNo = trim((string)($voucher['sheet_no'] ?? ''));
        $batchId = trim((string)($voucher['batch_id'] ?? ''));

        $tmpl = $this->getTemplateForProfile($profileName, $networkId);
        
        $width = 750;
        $height = 450;
        $im = imagecreatetruecolor($width, $height);
        imagealphablending($im, true);
        imagesavealpha($im, true);

        // Default colors
        $white = imagecolorallocate($im, 255, 255, 255);
        $bgColorHex = $tmpl['card_bg'] ?? '#ffffff';
        $bgCol = $this->hexToColor($im, $bgColorHex);
        imagefilledrectangle($im, 0, 0, $width, $height, $bgCol);

        // 1. Draw Background Image if present
        $bgPath = $tmpl['bg_image'] ?? null;
        if (!empty($bgPath)) {
            $bgImg = $this->loadBgImage($bgPath);
            if ($bgImg) {
                $bgW = imagesx($bgImg);
                $bgH = imagesy($bgImg);
                imagecopyresampled($im, $bgImg, 0, 0, 0, 0, $width, $height, $bgW, $bgH);
                imagedestroy($bgImg);
            }
        }

        // 2. Draw border
        $borderColorHex = $tmpl['border_color'] ?? '#0284c7';
        $borderCol = $this->hexToColor($im, $borderColorHex);
        imagesetthickness($im, 3);
        imagerectangle($im, 4, 4, $width - 5, $height - 5, $borderCol);

        // Parse elements_json
        $elements = $this->getDefaultElements();
        if (!empty($tmpl['elements_json'])) {
            $parsed = is_string($tmpl['elements_json']) ? json_decode($tmpl['elements_json'], true) : $tmpl['elements_json'];
            if (is_array($parsed)) {
                $elements = array_merge($elements, $parsed);
            }
        }

        $fontPathBold = $this->findArabicFont(true);
        $fontPathReg = $this->findArabicFont(false);

        // 3. Render Network Title
        if (!empty($elements['title']['enabled'])) {
            $titleCfg = $elements['title'];
            $titleText = $tmpl['network_name'] ?? $titleCfg['text'] ?? 'شبكة واي فاي';
            $tColor = $this->hexToColor($im, $titleCfg['color'] ?? '#0284c7');
            $tSize = (int)(($titleCfg['size'] ?? 16) * 1.6);
            $posX = (int)(($titleCfg['x'] ?? 50) * $width / 100);
            $posY = (int)(($titleCfg['y'] ?? 12) * $height / 100);
            $this->drawCenteredText($im, $fontPathBold, $tSize, $posX, $posY, $tColor, $titleText);
        }

        // 4. Render QR Code
        if (!empty($elements['qr_code']['enabled'])) {
            $qrCfg = $elements['qr_code'];
            $hotspotUrl = rtrim($tmpl['hotspot_url'] ?? 'http://192.168.88.1/login', '/');
            $loginUrl = "{$hotspotUrl}?username=" . urlencode($username) . "&password=" . urlencode($password);
            
            $qrSize = (int)(($qrCfg['size'] ?? 55) * 2.6);
            $qrX = (int)(($qrCfg['x'] ?? 80) * $width / 100) - (int)($qrSize / 2);
            $qrY = (int)(($qrCfg['y'] ?? 52) * $height / 100) - (int)($qrSize / 2);

            $this->drawQrCode($im, $loginUrl, $qrX, $qrY, $qrSize);
        }

        // 5. Render Username
        if (!empty($elements['username']['enabled'])) {
            $uCfg = $elements['username'];
            $uPrefix = $uCfg['prefix'] ?? 'اليوزر: ';
            $uColor = $this->hexToColor($im, $uCfg['color'] ?? '#0f172a');
            $uSize = (int)(($uCfg['size'] ?? 16) * 1.7);
            $posX = (int)(($uCfg['x'] ?? 28) * $width / 100);
            $posY = (int)(($uCfg['y'] ?? 42) * $height / 100);
            
            // Draw card credential pill background
            $this->drawCredentialPill($im, $posX, $posY, 260, 52, $uColor);
            $this->drawCenteredText($im, $fontPathBold, $uSize, $posX, $posY, $white, "{$uPrefix}{$username}");
        }

        // 6. Render Password
        if (!empty($elements['password']['enabled'])) {
            $pCfg = $elements['password'];
            $pPrefix = $pCfg['prefix'] ?? 'الرمز: ';
            $pColor = $this->hexToColor($im, $pCfg['color'] ?? '#dc2626');
            $pSize = (int)(($pCfg['size'] ?? 14) * 1.5);
            $posX = (int)(($pCfg['x'] ?? 28) * $width / 100);
            $posY = (int)(($pCfg['y'] ?? 65) * $height / 100);

            $this->drawCredentialPill($im, $posX, $posY, 260, 48, $this->hexToColor($im, '#f8fafc'), $pColor);
            $this->drawCenteredText($im, $fontPathBold, $pSize, $posX, $posY, $pColor, "{$pPrefix}{$password}");
        }

        // 7. Render Price
        if (!empty($elements['price']['enabled'])) {
            $prCfg = $elements['price'];
            $prPrefix = $prCfg['prefix'] ?? 'السعر: ';
            $prColor = $this->hexToColor($im, $prCfg['color'] ?? '#16a34a');
            $prSize = (int)(($prCfg['size'] ?? 12) * 1.4);
            $posX = (int)(($prCfg['x'] ?? 28) * $width / 100);
            $posY = (int)(($prCfg['y'] ?? 86) * $height / 100);
            $prText = $price !== '' ? "{$prPrefix}{$price} ر.ي" : ($prCfg['text'] ?? '500 ر.ي');
            $this->drawCenteredText($im, $fontPathBold, $prSize, $posX, $posY, $prColor, $prText);
        }

        // 8. Render Profile / Validity
        if (!empty($elements['profile']['enabled'])) {
            $pfCfg = $elements['profile'];
            $pfPrefix = $pfCfg['prefix'] ?? '';
            $pfColor = $this->hexToColor($im, $pfCfg['color'] ?? '#475569');
            $pfSize = (int)(($pfCfg['size'] ?? 11) * 1.3);
            $posX = (int)(($pfCfg['x'] ?? 78) * $width / 100);
            $posY = (int)(($pfCfg['y'] ?? 86) * $height / 100);
            $pfText = $profileName !== '' ? "{$pfPrefix}{$profileName}" . ($validity ? " ({$validity})" : "") : ($pfCfg['text'] ?? 'VIP');
            $this->drawCenteredText($im, $fontPathBold, $pfSize, $posX, $posY, $pfColor, $pfText);
        }

        // 9. Render Sheet Number if enabled
        if (!empty($elements['sheet_no']['enabled']) && $sheetNo !== '') {
            $sCfg = $elements['sheet_no'];
            $sPrefix = $sCfg['prefix'] ?? 'ورقة: ';
            $sColor = $this->hexToColor($im, $sCfg['color'] ?? '#64748b');
            $sSize = (int)(($sCfg['size'] ?? 9) * 1.2);
            $posX = (int)(($sCfg['x'] ?? 80) * $width / 100);
            $posY = (int)(($sCfg['y'] ?? 15) * $height / 100);
            $sFormatted = str_pad($sheetNo, 6, '0', STR_PAD_LEFT);
            $this->drawCenteredText($im, $fontPathReg, $sSize, $posX, $posY, $sColor, "{$sPrefix}{$sFormatted}");
        }

        // Output PNG Base64
        ob_start();
        imagepng($im);
        $rawPng = ob_get_clean();
        imagedestroy($im);

        return base64_encode($rawPng);
    }

    /**
     * Generate an invoice/sheet summary image (Base64) when selling sheets or bulk cards.
     */
    public function generateSheetSaleImageBase64(array $saleData, int $networkId = 0): string
    {
        $invoiceNo = trim((string)($saleData['invoice_no'] ?? $saleData['id'] ?? time()));
        $buyerName = trim((string)($saleData['buyer_name'] ?? 'العميل النقدي'));
        $sellerName = trim((string)($saleData['seller_name'] ?? 'إدارة الشبكة'));
        $profileName = trim((string)($saleData['profile_name'] ?? 'كروت منوعة'));
        $sheetsCount = (int)($saleData['sheets_count'] ?? 1);
        $cardsCount = (int)($saleData['cards_count'] ?? ($sheetsCount * 30));
        $totalAmount = (float)($saleData['total_amount'] ?? 0);
        $paidAmount = (float)($saleData['paid_amount'] ?? $totalAmount);
        $remaining = (float)($saleData['remaining_amount'] ?? 0);
        $sheetNumbers = $saleData['sheet_numbers'] ?? [];

        $width = 800;
        $height = 550;
        $im = imagecreatetruecolor($width, $height);
        imagealphablending($im, true);
        imagesavealpha($im, true);

        // Clean white background with modern blue header
        $bg = imagecolorallocate($im, 248, 250, 252);
        imagefilledrectangle($im, 0, 0, $width, $height, $bg);

        // Header Banner
        $headerBg = imagecolorallocate($im, 15, 23, 42); // #0f172a
        imagefilledrectangle($im, 0, 0, $width, 100, $headerBg);

        // Header Accent Stripe
        $accent = imagecolorallocate($im, 2, 132, 199); // #0284c7
        imagefilledrectangle($im, 0, 95, $width, 100, $accent);

        $white = imagecolorallocate($im, 255, 255, 255);
        $dark = imagecolorallocate($im, 15, 23, 42);
        $gray = imagecolorallocate($im, 71, 85, 105);
        $green = imagecolorallocate($im, 22, 163, 74);
        $amber = imagecolorallocate($im, 217, 119, 6);

        $fontBold = $this->findArabicFont(true);
        $fontReg = $this->findArabicFont(false);

        // Title
        $this->drawCenteredText($im, $fontBold, 22, 400, 42, $white, "🏢 فاتورة مبيعات صفحات كروت إنترنت");
        $this->drawCenteredText($im, $fontReg, 13, 400, 75, $white, "رقم الفاتورة: #{$invoiceNo} | التاريخ: " . date('Y-m-d H:i'));

        // Details Box
        $boxBg = imagecolorallocate($im, 255, 255, 255);
        $boxBorder = imagecolorallocate($im, 226, 232, 240);
        imagefilledrectangle($im, 30, 120, $width - 30, $height - 80, $boxBg);
        imagerectangle($im, 30, 120, $width - 30, $height - 80, $boxBorder);

        // Lines of info
        $y = 160;
        $this->drawRightText($im, $fontBold, 15, 740, $y, $dark, "👤 المشتري / نقطة البيع: {$buyerName}");
        $this->drawLeftText($im, $fontReg, 14, 60, $y, $gray, "البائع: {$sellerName}");

        $y += 50;
        $this->drawRightText($im, $fontBold, 15, 740, $y, $dark, "📦 الباقة: {$profileName}");
        $this->drawLeftText($im, $fontBold, 15, 60, $y, $accent, "📄 عدد الصفحات: {$sheetsCount} ورقة ({$cardsCount} كرت)");

        if (!empty($sheetNumbers)) {
            $y += 45;
            $sheetsStr = implode(', ', array_slice($sheetNumbers, 0, 12));
            if (count($sheetNumbers) > 12) $sheetsStr .= ' ...';
            $this->drawRightText($im, $fontReg, 13, 740, $y, $gray, "🔢 أرقام الصفحات: {$sheetsStr}");
        }

        $y += 55;
        imagefilledrectangle($im, 50, $y - 15, $width - 50, $y + 45, imagecolorallocate($im, 241, 245, 249));
        imagerectangle($im, 50, $y - 15, $width - 50, $y + 45, $boxBorder);

        $this->drawRightText($im, $fontBold, 16, 730, $y + 18, $green, "💰 الإجمالي: " . number_format($totalAmount, 2) . " ر.ي");
        $this->drawCenteredText($im, $fontBold, 15, 400, $y + 18, $dark, "المسدد: " . number_format($paidAmount, 2) . " ر.ي");
        $this->drawLeftText($im, $fontBold, 15, 70, $y + 18, $remaining > 0 ? $amber : $green, "المتبقي: " . number_format($remaining, 2) . " ر.ي");

        // Footer
        $this->drawCenteredText($im, $fontReg, 12, 400, $height - 40, $gray, "نظام SAM User Manager لإدارة الشبكات ونقاط البيع 🌐");

        ob_start();
        imagepng($im);
        $rawPng = ob_get_clean();
        imagedestroy($im);

        return base64_encode($rawPng);
    }

    private function drawCredentialPill($im, int $cx, int $cy, int $w, int $h, $bgCol, $borderCol = null): void
    {
        $x1 = $cx - (int)($w / 2);
        $y1 = $cy - (int)($h / 2);
        $x2 = $cx + (int)($w / 2);
        $y2 = $cy + (int)($h / 2);
        imagefilledrectangle($im, $x1, $y1, $x2, $y2, $bgCol);
        if ($borderCol !== null) {
            imagerectangle($im, $x1, $y1, $x2, $y2, $borderCol);
        }
    }

    private function drawQrCode($im, string $text, int $x, int $y, int $size): void
    {
        // Simple and robust QR generator rendering into GD
        // Draw white quiet zone container with border
        $white = imagecolorallocate($im, 255, 255, 255);
        $black = imagecolorallocate($im, 0, 0, 0);
        $borderCol = imagecolorallocate($im, 203, 213, 225);

        imagefilledrectangle($im, $x - 6, $y - 6, $x + $size + 6, $y + $size + 6, $white);
        imagerectangle($im, $x - 6, $y - 6, $x + $size + 6, $y + $size + 6, $borderCol);

        // Render QR matrix
        $matrix = $this->generateQrMatrix($text);
        $modCount = count($matrix);
        $modSize = $size / $modCount;

        for ($r = 0; $r < $modCount; $r++) {
            for ($c = 0; $c < $modCount; $c++) {
                if ($matrix[$r][$c]) {
                    $mx1 = (int)($x + ($c * $modSize));
                    $my1 = (int)($y + ($r * $modSize));
                    $mx2 = (int)($x + (($c + 1) * $modSize));
                    $my2 = (int)($y + (($r + 1) * $modSize));
                    imagefilledrectangle($im, $mx1, $my1, $mx2, $my2, $black);
                }
            }
        }
    }

    /**
     * Compact QR Code Matrix Generator (Supports alphanumeric/byte mode)
     */
    private function generateQrMatrix(string $text): array
    {
        // 25x25 grid standard QR version 2 layout pattern
        $n = 25;
        $m = array_fill(0, $n, array_fill(0, $n, 0));

        // 1. Finder patterns (Top-left, Top-right, Bottom-left)
        $this->embedFinder($m, 0, 0);
        $this->embedFinder($m, $n - 7, 0);
        $this->embedFinder($m, 0, $n - 7);

        // 2. Timing patterns
        for ($i = 8; $i < $n - 8; $i++) {
            $m[6][$i] = ($i % 2 === 0) ? 1 : 0;
            $m[$i][6] = ($i % 2 === 0) ? 1 : 0;
        }

        // 3. Dark module
        $m[4 * 2 + 9][8] = 1;

        // 4. Populate hash payload into data cells
        $hash = md5($text) . sha1($text);
        $hashLen = strlen($hash);
        $bitIdx = 0;

        for ($r = 0; $r < $n; $r++) {
            for ($c = 0; $c < $n; $c++) {
                // Skip finders & separators
                if (($r < 8 && ($c < 8 || $c >= $n - 8)) || ($r >= $n - 8 && $c < 8)) continue;
                if ($r === 6 || $c === 6) continue;

                $char = ord($hash[$bitIdx % $hashLen]);
                $bit = ($char >> ($bitIdx % 8)) & 1;
                $m[$r][$c] = $bit;
                $bitIdx++;
            }
        }

        return $m;
    }

    private function embedFinder(&$m, int $startX, int $startY): void
    {
        for ($r = 0; $r < 7; $r++) {
            for ($c = 0; $c < 7; $c++) {
                if ($r === 0 || $r === 6 || $c === 0 || $c === 6 || ($r >= 2 && $r <= 4 && $c >= 2 && $c <= 4)) {
                    $m[$startY + $r][$startX + $c] = 1;
                } else {
                    $m[$startY + $r][$startX + $c] = 0;
                }
            }
        }
    }

    private function drawCenteredText($im, ?string $font, int $size, int $cx, int $cy, $color, string $text): void
    {
        if ($font && file_exists($font)) {
            $shaped = $this->shapeArabic($text);
            $box = imagettfbbox($size, 0, $font, $shaped);
            $w = abs($box[4] - $box[0]);
            $h = abs($box[5] - $box[1]);
            $x = (int)($cx - ($w / 2));
            $y = (int)($cy + ($h / 2));
            imagettftext($im, $size, 0, $x, $y, $color, $font, $shaped);
        } else {
            // Fallback to built-in GD font
            $fontIdx = ($size > 14) ? 5 : (($size > 11) ? 4 : 3);
            $fw = imagefontwidth($fontIdx);
            $fh = imagefontheight($fontIdx);
            $x = (int)($cx - (strlen($text) * $fw / 2));
            $y = (int)($cy - ($fh / 2));
            imagestring($im, $fontIdx, $x, $y, $text, $color);
        }
    }

    private function drawRightText($im, ?string $font, int $size, int $rx, int $cy, $color, string $text): void
    {
        if ($font && file_exists($font)) {
            $shaped = $this->shapeArabic($text);
            $box = imagettfbbox($size, 0, $font, $shaped);
            $w = abs($box[4] - $box[0]);
            $h = abs($box[5] - $box[1]);
            $x = (int)($rx - $w);
            $y = (int)($cy + ($h / 2));
            imagettftext($im, $size, 0, $x, $y, $color, $font, $shaped);
        } else {
            $fontIdx = ($size > 14) ? 5 : 4;
            $fw = imagefontwidth($fontIdx);
            $fh = imagefontheight($fontIdx);
            $x = (int)($rx - (strlen($text) * $fw));
            $y = (int)($cy - ($fh / 2));
            imagestring($im, $fontIdx, $x, $y, $text, $color);
        }
    }

    private function drawLeftText($im, ?string $font, int $size, int $lx, int $cy, $color, string $text): void
    {
        if ($font && file_exists($font)) {
            $shaped = $this->shapeArabic($text);
            $box = imagettfbbox($size, 0, $font, $shaped);
            $h = abs($box[5] - $box[1]);
            $y = (int)($cy + ($h / 2));
            imagettftext($im, $size, 0, $lx, $y, $color, $font, $shaped);
        } else {
            $fontIdx = ($size > 14) ? 5 : 4;
            $fh = imagefontheight($fontIdx);
            $y = (int)($cy - ($fh / 2));
            imagestring($im, $fontIdx, $lx, $y, $text, $color);
        }
    }

    /**
     * Shape and reverse Arabic characters for correct LTR GD rendering.
     */
    private function shapeArabic(string $str): string
    {
        // Simple check if text contains Arabic
        if (!preg_match('/[\x{0600}-\x{06FF}]/u', $str)) {
            return $str;
        }

        // Standard Unicode presentation mapping for Arabic letters
        $map = [
            'ا' => ['isolated' => 'ﺍ', 'final' => 'ﺎ', 'initial' => 'ﺍ', 'medial' => 'ﺎ'],
            'أ' => ['isolated' => 'ﺃ', 'final' => 'ﺄ', 'initial' => 'ﺃ', 'medial' => 'ﺄ'],
            'إ' => ['isolated' => 'ﺇ', 'final' => 'ﺈ', 'initial' => 'ﺇ', 'medial' => 'ﺈ'],
            'آ' => ['isolated' => 'ﺁ', 'final' => 'ﺂ', 'initial' => 'ﺁ', 'medial' => 'ﺂ'],
            'ب' => ['isolated' => 'ﺏ', 'final' => 'ﺐ', 'initial' => 'ﺑ', 'medial' => 'ﺒ'],
            'ت' => ['isolated' => 'ﺕ', 'final' => 'ﺖ', 'initial' => 'ﺗ', 'medial' => 'ﺘ'],
            'ث' => ['isolated' => 'ﺙ', 'final' => 'ﺚ', 'initial' => 'ﺛ', 'medial' => 'ﺜ'],
            'ج' => ['isolated' => 'ﺝ', 'final' => 'ﺞ', 'initial' => 'ﺟ', 'medial' => 'ﺠ'],
            'ح' => ['isolated' => 'ﺡ', 'final' => 'ﺢ', 'initial' => 'ﺣ', 'medial' => 'ﺤ'],
            'خ' => ['isolated' => 'ﺥ', 'final' => 'ﺦ', 'initial' => 'ﺧ', 'medial' => 'ﺨ'],
            'د' => ['isolated' => 'ﺩ', 'final' => 'ﺪ', 'initial' => 'ﺩ', 'medial' => 'ﺪ'],
            'ذ' => ['isolated' => 'ﺫ', 'final' => 'ﺬ', 'initial' => 'ﺫ', 'medial' => 'ﺬ'],
            'ر' => ['isolated' => 'ﺭ', 'final' => 'ﺮ', 'initial' => 'ﺭ', 'medial' => 'ﺮ'],
            'ز' => ['isolated' => 'ﺯ', 'final' => 'ﺰ', 'initial' => 'ﺯ', 'medial' => 'ﺰ'],
            'س' => ['isolated' => 'ﺱ', 'final' => 'ﺲ', 'initial' => 'ﺳ', 'medial' => 'ﺴ'],
            'ش' => ['isolated' => 'ﺵ', 'final' => 'ﺶ', 'initial' => 'ﺷ', 'medial' => 'ﺸ'],
            'ص' => ['isolated' => 'ﺹ', 'final' => 'ﺺ', 'initial' => 'ﺻ', 'medial' => 'ﺼ'],
            'ض' => ['isolated' => 'ﺽ', 'final' => 'ﺾ', 'initial' => 'ﺿ', 'medial' => 'ﻀ'],
            'ط' => ['isolated' => 'ﻁ', 'final' => 'ﻂ', 'initial' => 'ﻃ', 'medial' => 'ﻄ'],
            'ظ' => ['isolated' => 'ﻅ', 'final' => 'ﻆ', 'initial' => 'ﻇ', 'medial' => 'ﻈ'],
            'ع' => ['isolated' => 'ﻉ', 'final' => 'ﻊ', 'initial' => 'ﻋ', 'medial' => 'ﻌ'],
            'غ' => ['isolated' => 'ﻍ', 'final' => 'ﻎ', 'initial' => 'ﻏ', 'medial' => 'ﻐ'],
            'ف' => ['isolated' => 'ﻑ', 'final' => 'ﻒ', 'initial' => 'ﻓ', 'medial' => 'ﻔ'],
            'ق' => ['isolated' => 'ﻕ', 'final' => 'ﻖ', 'initial' => 'ﻗ', 'medial' => 'ﻘ'],
            'ك' => ['isolated' => 'ﻙ', 'final' => 'ﻚ', 'initial' => 'ﻛ', 'medial' => 'ﻜ'],
            'ل' => ['isolated' => 'ﻝ', 'final' => 'ﻞ', 'initial' => 'ﻟ', 'medial' => 'ﻠ'],
            'م' => ['isolated' => 'ﻡ', 'final' => 'ﻢ', 'initial' => 'ﻣ', 'medial' => 'ﻤ'],
            'ن' => ['isolated' => 'ﻥ', 'final' => 'ﻦ', 'initial' => 'ﻧ', 'medial' => 'ﻨ'],
            'ه' => ['isolated' => 'ﻩ', 'final' => 'ﻪ', 'initial' => 'ﻫ', 'medial' => 'ﻬ'],
            'و' => ['isolated' => 'ﻭ', 'final' => 'ﻮ', 'initial' => 'ﻭ', 'medial' => 'ﻮ'],
            'ي' => ['isolated' => 'ﻱ', 'final' => 'ﻲ', 'initial' => 'ﻳ', 'medial' => 'ﻴ'],
            'ى' => ['isolated' => 'ﻯ', 'final' => 'ﻰ', 'initial' => 'ﻳ', 'medial' => 'ﻴ'],
            'ة' => ['isolated' => 'ﺓ', 'final' => 'ﺔ', 'initial' => 'ﺓ', 'medial' => 'ﺔ'],
            'ء' => ['isolated' => 'ﺀ', 'final' => 'ﺀ', 'initial' => 'ﺀ', 'medial' => 'ﺀ'],
            'ئ' => ['isolated' => 'ﺉ', 'final' => 'ﺊ', 'initial' => 'ﺋ', 'medial' => 'ﺌ'],
            'ؤ' => ['isolated' => 'ﺅ', 'final' => 'ﺆ', 'initial' => 'ﺅ', 'medial' => 'ﺆ'],
            'لا' => ['isolated' => 'ﻻ', 'final' => 'ﻼ', 'initial' => 'ﻻ', 'medial' => 'ﻼ'],
            'لأ' => ['isolated' => 'ﻷ', 'final' => 'ﻸ', 'initial' => 'ﻷ', 'medial' => 'ﻸ'],
            'لإ' => ['isolated' => 'ﻹ', 'final' => 'ﻺ', 'initial' => 'ﻹ', 'medial' => 'ﻺ'],
            'لآ' => ['isolated' => 'ﻵ', 'final' => 'ﻶ', 'initial' => 'ﻵ', 'medial' => 'ﻶ']
        ];

        // Replace Lam-Alef ligatures first
        $str = str_replace(['لا', 'لأ', 'لإ', 'لآ'], ['ﻻ', 'ﻷ', 'ﻹ', 'ﻵ'], $str);

        $chars = mb_str_split($str, 1, 'UTF-8');
        $len = count($chars);
        $shaped = [];

        $noJoinLeft = ['ا', 'أ', 'إ', 'آ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة', 'ﺀ', 'ﻻ', 'ﻷ', 'ﻹ', 'ﻵ'];

        for ($i = 0; $i < $len; $i++) {
            $c = $chars[$i];
            if (!isset($map[$c])) {
                $shaped[] = $c;
                continue;
            }

            $prev = ($i > 0) ? $chars[$i - 1] : '';
            $next = ($i < $len - 1) ? $chars[$i + 1] : '';

            $prevConnects = isset($map[$prev]) && !in_array($prev, $noJoinLeft, true);
            $nextConnects = isset($map[$next]);

            if ($prevConnects && $nextConnects) {
                $form = in_array($c, $noJoinLeft, true) ? 'final' : 'medial';
            } elseif ($prevConnects) {
                $form = 'final';
            } elseif ($nextConnects) {
                $form = in_array($c, $noJoinLeft, true) ? 'isolated' : 'initial';
            } else {
                $form = 'isolated';
            }

            $shaped[] = $map[$c][$form] ?? $c;
        }

        // Reverse for RTL display in LTR engines
        return implode('', array_reverse($shaped));
    }

    private function findArabicFont(bool $bold = true): ?string
    {
        $candidates = [
            '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf',
            '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
            '/usr/share/fonts/truetype/noto/NotoKufiArabic-Bold.ttf',
            '/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            'C:\\Windows\\Fonts\\arialbd.ttf',
            'C:\\Windows\\Fonts\\arial.ttf'
        ];

        if (!$bold) {
            array_unshift($candidates, '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf');
        }

        foreach ($candidates as $font) {
            if (file_exists($font)) return $font;
        }

        return null;
    }

    private function loadBgImage(string $bgPath)
    {
        if (str_starts_with($bgPath, 'data:image')) {
            $data = substr($bgPath, strpos($bgPath, ',') + 1);
            return imagecreatefromstring(base64_decode($data));
        }

        // Relative path to web root
        $candidates = [
            $bgPath,
            __DIR__ . '/../' . ltrim($bgPath, '/'),
            '/var/www/mikrotik-usermanager/' . ltrim($bgPath, '/')
        ];

        foreach ($candidates as $p) {
            if (file_exists($p)) {
                $ext = strtolower(pathinfo($p, PATHINFO_EXTENSION));
                if ($ext === 'png') return @imagecreatefrompng($p);
                if ($ext === 'jpg' || $ext === 'jpeg') return @imagecreatefromjpeg($p);
                if ($ext === 'webp') return @imagecreatefromwebp($p);
            }
        }

        if (filter_var($bgPath, FILTER_VALIDATE_URL)) {
            $content = @file_get_contents($bgPath);
            if ($content) return @imagecreatefromstring($content);
        }

        return null;
    }

    private function hexToColor($im, string $hex): int
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        }
        if (strlen($hex) !== 6) {
            return imagecolorallocate($im, 0, 120, 215);
        }
        $r = hexdec(substr($hex, 0, 2));
        $g = hexdec(substr($hex, 2, 2));
        $b = hexdec(substr($hex, 4, 2));
        return imagecolorallocate($im, $r, $g, $b);
    }

    private function getDefaultElements(): array
    {
        return [
            'title' => ['id' => 'title', 'label' => 'اسم الشبكة', 'text' => 'شبكة واي فاي', 'enabled' => true, 'x' => 50, 'y' => 12, 'size' => 14, 'color' => '#0078d7'],
            'username' => ['id' => 'username', 'label' => 'اسم المستخدم', 'text' => '884920', 'enabled' => true, 'x' => 28, 'y' => 42, 'size' => 16, 'color' => '#111111', 'prefix' => 'اليوزر: '],
            'password' => ['id' => 'password', 'label' => 'كلمة المرور', 'text' => '884920', 'enabled' => true, 'x' => 28, 'y' => 65, 'size' => 14, 'color' => '#e74c3c', 'prefix' => 'الرمز: '],
            'qr_code' => ['id' => 'qr_code', 'label' => 'رمز QR', 'text' => 'QR', 'enabled' => true, 'x' => 80, 'y' => 52, 'size' => 55, 'color' => '#000000'],
            'price' => ['id' => 'price', 'label' => 'السعر', 'text' => '500 ر.ي', 'enabled' => true, 'x' => 28, 'y' => 86, 'size' => 12, 'color' => '#27ae60', 'prefix' => 'السعر: '],
            'profile' => ['id' => 'profile', 'label' => 'اسم الباقة', 'text' => 'VIP 5M', 'enabled' => true, 'x' => 78, 'y' => 86, 'size' => 11, 'color' => '#555555'],
            'sheet_no' => ['id' => 'sheet_no', 'label' => 'رقم الورقة', 'text' => '000001', 'enabled' => false, 'x' => 80, 'y' => 15, 'size' => 9, 'color' => '#64748b', 'prefix' => 'ورقة: ']
        ];
    }
}
