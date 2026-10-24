<?php
declare(strict_types=1);

/**
 * Standard ISO/IEC 18004 QR Code Generator.
 * Generates standard-compliant, camera-scannable QR code matrices and SVG vectors.
 */
final class QrCodeGenerator
{
    private static array $exp = [];
    private static array $log = [];
    private static bool $initialized = false;

    private static array $specs = [
        1 => ['size' => 21, 'data' => 19, 'ec' => 7, 'blocks' => 1, 'align' => []],
        2 => ['size' => 25, 'data' => 34, 'ec' => 10, 'blocks' => 1, 'align' => [6, 18]],
        3 => ['size' => 29, 'data' => 55, 'ec' => 15, 'blocks' => 1, 'align' => [6, 22]],
        4 => ['size' => 33, 'data' => 80, 'ec' => 20, 'blocks' => 1, 'align' => [6, 26]],
        5 => ['size' => 37, 'data' => 108, 'ec' => 26, 'blocks' => 1, 'align' => [6, 30]],
        6 => ['size' => 41, 'data' => 136, 'ec' => 18, 'blocks' => 2, 'align' => [6, 34]],
        7 => ['size' => 45, 'data' => 156, 'ec' => 20, 'blocks' => 2, 'align' => [6, 22, 38]],
        8 => ['size' => 49, 'data' => 194, 'ec' => 24, 'blocks' => 2, 'align' => [6, 24, 42]],
        9 => ['size' => 53, 'data' => 232, 'ec' => 30, 'blocks' => 2, 'align' => [6, 26, 46]],
        10 => ['size' => 57, 'data' => 274, 'ec' => 18, 'blocks' => 4, 'align' => [6, 28, 50]],
    ];

    private static array $formatInfoL = [
        0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976
    ];

    private static function initGf(): void
    {
        if (self::$initialized) return;
        self::$exp = array_fill(0, 512, 0);
        self::$log = array_fill(0, 256, 0);
        $val = 1;
        for ($i = 0; $i < 255; $i++) {
            self::$exp[$i] = $val;
            self::$exp[$i + 255] = $val;
            self::$log[$val] = $i;
            $val = ($val << 1) ^ (($val & 0x80) ? 0x11D : 0);
        }
        self::$initialized = true;
    }

    private static function gfMul(int $x, int $y): int
    {
        if ($x === 0 || $y === 0) return 0;
        return self::$exp[self::$log[$x] + self::$log[$y]];
    }

    private static function rsPoly(int $ecCount): array
    {
        $g = [1];
        for ($i = 0; $i < $ecCount; $i++) {
            $root = self::$exp[$i];
            $newG = array_fill(0, count($g) + 1, 0);
            for ($j = 0; $j < count($g); $j++) {
                $newG[$j] ^= $g[$j];
                $newG[$j + 1] ^= self::gfMul($g[$j], $root);
            }
            $g = $newG;
        }
        return $g;
    }

    private static function rsEncode(array $data, int $ecCount): array
    {
        $gen = self::rsPoly($ecCount);
        $res = array_merge($data, array_fill(0, $ecCount, 0));
        $len = count($data);
        for ($i = 0; $i < $len; $i++) {
            $lead = $res[$i];
            if ($lead !== 0) {
                for ($j = 0; $j < count($gen); $j++) {
                    $res[$i + $j] ^= self::gfMul($gen[$j], $lead);
                }
            }
        }
        return array_slice($res, $len);
    }

    private static function chooseVersion(int $len): int
    {
        foreach (self::$specs as $v => $spec) {
            if ($len <= ($spec['data'] - 2)) {
                return $v;
            }
        }
        return 10;
    }

    public static function matrix(string $text): array
    {
        self::initGf();
        $v = self::chooseVersion(strlen($text));
        $spec = self::$specs[$v];
        $size = $spec['size'];
        $dataCap = $spec['data'];

        $bits = [0, 1, 0, 0]; // Byte mode
        $count = strlen($text);
        for ($i = 7; $i >= 0; $i--) {
            $bits[] = ($count >> $i) & 1;
        }
        for ($i = 0; $i < $count; $i++) {
            $byte = ord($text[$i]);
            for ($j = 7; $j >= 0; $j--) {
                $bits[] = ($byte >> $j) & 1;
            }
        }

        $maxBits = $dataCap * 8;
        $term = min(4, $maxBits - count($bits));
        for ($i = 0; $i < $term; $i++) $bits[] = 0;
        while (count($bits) % 8 !== 0) $bits[] = 0;

        $pad = [0xEC, 0x11];
        $pIdx = 0;
        while (count($bits) < $maxBits) {
            $val = $pad[$pIdx % 2];
            $pIdx++;
            for ($j = 7; $j >= 0; $j--) {
                $bits[] = ($val >> $j) & 1;
            }
        }

        $dataBytes = [];
        for ($i = 0; $i < count($bits); $i += 8) {
            $byteVal = 0;
            for ($j = 0; $j < 8; $j++) {
                $byteVal = ($byteVal << 1) | $bits[$i + $j];
            }
            $dataBytes[] = $byteVal;
        }

        $blocksCount = $spec['blocks'];
        $ecCount = $spec['ec'];
        $blockDataLen = (int)(count($dataBytes) / $blocksCount);

        $dataBlocks = [];
        $ecBlocks = [];
        for ($b = 0; $b < $blocksCount; $b++) {
            $bData = array_slice($dataBytes, $b * $blockDataLen, $blockDataLen);
            $dataBlocks[] = $bData;
            $ecBlocks[] = self::rsEncode($bData, $ecCount);
        }

        $codewords = [];
        for ($i = 0; $i < $blockDataLen; $i++) {
            for ($b = 0; $b < $blocksCount; $b++) {
                $codewords[] = $dataBlocks[$b][$i];
            }
        }
        for ($i = 0; $i < $ecCount; $i++) {
            for ($b = 0; $b < $blocksCount; $b++) {
                $codewords[] = $ecBlocks[$b][$i];
            }
        }

        $matrix = array_fill(0, $size, array_fill(0, $size, null));
        $reserved = array_fill(0, $size, array_fill(0, $size, false));

        $addFinder = static function(int $ox, int $oy) use (&$matrix, &$reserved, $size) {
            for ($y = -1; $y <= 7; $y++) {
                for ($x = -1; $x <= 7; $x++) {
                    $r = $oy + $y;
                    $c = $ox + $x;
                    if ($r >= 0 && $r < $size && $c >= 0 && $c < $size) {
                        $reserved[$r][$c] = true;
                        if ($x >= 0 && $x <= 6 && $y >= 0 && $y <= 6) {
                            $isBlack = ($x === 0 || $x === 6 || $y === 0 || $y === 6 || ($x >= 2 && $x <= 4 && $y >= 2 && $y <= 4));
                            $matrix[$r][$c] = $isBlack;
                        } else {
                            $matrix[$r][$c] = false;
                        }
                    }
                }
            }
        };

        $addFinder(0, 0);
        $addFinder($size - 7, 0);
        $addFinder(0, $size - 7);

        // Timing patterns
        for ($i = 8; $i < $size - 8; $i++) {
            if ($matrix[6][$i] === null) {
                $matrix[6][$i] = ($i % 2 === 0);
                $reserved[6][$i] = true;
            }
            if ($matrix[$i][6] === null) {
                $matrix[$i][6] = ($i % 2 === 0);
                $reserved[$i][6] = true;
            }
        }

        // Alignment patterns
        $align = $spec['align'];
        foreach ($align as $ay) {
            foreach ($align as $ax) {
                if (($ay < 9 && $ax < 9) || ($ay < 9 && $ax >= $size - 9) || ($ay >= $size - 9 && $ax < 9)) {
                    continue;
                }
                for ($y = -2; $y <= 2; $y++) {
                    for ($x = -2; $x <= 2; $x++) {
                        $r = $ay + $y;
                        $c = $ax + $x;
                        $reserved[$r][$c] = true;
                        $matrix[$r][$c] = (abs($x) === 2 || abs($y) === 2 || ($x === 0 && $y === 0));
                    }
                }
            }
        }

        // Dark module
        $matrix[4 * $v + 9][8] = true;
        $reserved[4 * $v + 9][8] = true;

        // Reserve format info
        for ($i = 0; $i <= 8; $i++) {
            $reserved[8][$i] = true;
            $reserved[$i][8] = true;
        }
        for ($i = $size - 8; $i < $size; $i++) {
            $reserved[8][$i] = true;
            $reserved[$i][8] = true;
        }

        // Data bit stream
        $cwBits = [];
        foreach ($codewords as $cw) {
            for ($i = 7; $i >= 0; $i--) {
                $cwBits[] = ($cw >> $i) & 1;
            }
        }

        $bitIdx = 0;
        $col = $size - 1;
        $upward = true;
        while ($col > 0) {
            if ($col === 6) $col--;
            $rowRange = $upward ? range($size - 1, 0, -1) : range(0, $size - 1);
            foreach ($rowRange as $row) {
                foreach ([$col, $col - 1] as $c) {
                    if (!$reserved[$row][$c]) {
                        $b = $bitIdx < count($cwBits) ? $cwBits[$bitIdx] : 0;
                        $bitIdx++;
                        $matrix[$row][$c] = ($b === 1);
                    }
                }
            }
            $upward = !$upward;
            $col -= 2;
        }

        $getMask = static function(int $mask, int $r, int $c): bool {
            return match($mask) {
                0 => ($r + $c) % 2 === 0,
                1 => $r % 2 === 0,
                2 => $c % 3 === 0,
                3 => ($r + $c) % 3 === 0,
                4 => ((int)($r / 2) + (int)($c / 3)) % 2 === 0,
                5 => (($r * $c) % 2) + (($r * $c) % 3) === 0,
                6 => ((($r * $c) % 2) + (($r * $c) % 3)) % 2 === 0,
                7 => ((($r + $c) % 2) + (($r * $c) % 3)) % 2 === 0,
                default => false
            };
        };

        $bestScore = PHP_INT_MAX;
        $bestMatrix = $matrix;

        for ($mask = 0; $mask < 8; $mask++) {
            $mCopy = $matrix;
            for ($r = 0; $r < $size; $r++) {
                for ($c = 0; $c < $size; $c++) {
                    if (!$reserved[$r][$c]) {
                        if ($getMask($mask, $r, $c)) {
                            $mCopy[$r][$c] = !$mCopy[$r][$c];
                        }
                    }
                }
            }

            $fmt = self::$formatInfoL[$mask];
            $fmtBits = [];
            for ($i = 0; $i < 15; $i++) {
                $fmtBits[] = ($fmt >> $i) & 1;
            }

            // Top-left area: bit 14 at (8, 0)... bit 0 at (0, 8)
            $mCopy[8][0] = ($fmtBits[14] === 1);
            $mCopy[8][1] = ($fmtBits[13] === 1);
            $mCopy[8][2] = ($fmtBits[12] === 1);
            $mCopy[8][3] = ($fmtBits[11] === 1);
            $mCopy[8][4] = ($fmtBits[10] === 1);
            $mCopy[8][5] = ($fmtBits[9] === 1);
            $mCopy[8][7] = ($fmtBits[8] === 1);
            $mCopy[8][8] = ($fmtBits[7] === 1);
            $mCopy[7][8] = ($fmtBits[6] === 1);
            $mCopy[5][8] = ($fmtBits[5] === 1);
            $mCopy[4][8] = ($fmtBits[4] === 1);
            $mCopy[3][8] = ($fmtBits[3] === 1);
            $mCopy[2][8] = ($fmtBits[2] === 1);
            $mCopy[1][8] = ($fmtBits[1] === 1);
            $mCopy[0][8] = ($fmtBits[0] === 1);

            // Second copy: top-right bits 0..7 and bottom-left bits 8..14
            for ($i = 0; $i < 8; $i++) {
                $mCopy[8][$size - 1 - $i] = ($fmtBits[$i] === 1);
            }
            for ($i = 0; $i < 7; $i++) {
                $mCopy[$size - 7 + $i][8] = ($fmtBits[8 + $i] === 1);
            }

            // Penalty score (Rule 1)
            $score = 0;
            for ($r = 0; $r < $size; $r++) {
                $run = 0; $last = null;
                for ($c = 0; $c < $size; $c++) {
                    $val = $mCopy[$r][$c];
                    if ($val === $last) $run++;
                    else {
                        if ($run >= 5) $score += 3 + ($run - 5);
                        $run = 1; $last = $val;
                    }
                }
                if ($run >= 5) $score += 3 + ($run - 5);
            }
            for ($c = 0; $c < $size; $c++) {
                $run = 0; $last = null;
                for ($r = 0; $r < $size; $r++) {
                    $val = $mCopy[$r][$c];
                    if ($val === $last) $run++;
                    else {
                        if ($run >= 5) $score += 3 + ($run - 5);
                        $run = 1; $last = $val;
                    }
                }
                if ($run >= 5) $score += 3 + ($run - 5);
            }

            if ($score < $bestScore) {
                $bestScore = $score;
                $bestMatrix = $mCopy;
            }
        }

        return $bestMatrix;
    }

    public static function svg(string $text, int $size = 48): string
    {
        $matrix = self::matrix($text);
        $count = count($matrix);
        $quiet = 2;
        $totalSize = $count + ($quiet * 2);

        $path = '';
        for ($r = 0; $r < $count; $r++) {
            for ($c = 0; $c < $count; $c++) {
                if ($matrix[$r][$c]) {
                    $x = $c + $quiet;
                    $y = $r + $quiet;
                    $path .= "M{$x},{$y}h1v1h-1z ";
                }
            }
        }

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . $totalSize . ' ' . $totalSize . '" width="' . $size . '" height="' . $size . '" shape-rendering="crispEdges">'
             . '<rect width="100%" height="100%" fill="#ffffff"/>'
             . '<path d="' . rtrim($path) . '" fill="#000000"/>'
             . '</svg>';
    }
}
