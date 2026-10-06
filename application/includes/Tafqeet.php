<?php
/**
 * Tafqeet Helper - Arabic Number-to-Words Financial Engine
 * SAM User Manager
 */

class Tafqeet {
    private static $ones = [
        0 => '',
        1 => 'واحد',
        2 => 'اثنان',
        3 => 'ثلاثة',
        4 => 'أربعة',
        5 => 'خمسة',
        6 => 'ستة',
        7 => 'سبعة',
        8 => 'ثمانية',
        9 => 'تسعة',
        10 => 'عشرة',
        11 => 'أحد عشر',
        12 => 'اثنا عشر',
        13 => 'ثلاثة عشر',
        14 => 'أربعة عشر',
        15 => 'خمسة عشر',
        16 => 'ستة عشر',
        17 => 'سبعة عشر',
        18 => 'ثمانية عشر',
        19 => 'تسعة عشر'
    ];

    private static $tens = [
        2 => 'عشرون',
        3 => 'ثلاثون',
        4 => 'أربعون',
        5 => 'خمسون',
        6 => 'ستون',
        7 => 'سبعون',
        8 => 'ثمانون',
        9 => 'تسعون'
    ];

    private static $hundreds = [
        1 => 'مائة',
        2 => 'مائتان',
        3 => 'ثلاثمائة',
        4 => 'أربعمائة',
        5 => 'خمسمائة',
        6 => 'ستمائة',
        7 => 'سبعمائة',
        8 => 'ثمانمائة',
        9 => 'تسعمائة'
    ];

    private static function convertChunk(int $num): string {
        if ($num === 0) return '';
        $parts = [];

        $h = intdiv($num, 100);
        $remainder = $num % 100;

        if ($h > 0) {
            $parts[] = self::$hundreds[$h];
        }

        if ($remainder > 0) {
            if ($remainder < 20) {
                $parts[] = self::$ones[$remainder];
            } else {
                $u = $remainder % 10;
                $t = intdiv($remainder, 10);
                if ($u > 0) {
                    $parts[] = self::$ones[$u] . ' و' . self::$tens[$t];
                } else {
                    $parts[] = self::$tens[$t];
                }
            }
        }

        return implode(' و', $parts);
    }

    public static function words($amount, string $currency = 'ريال يمني', string $subUnit = 'فلس'): string {
        $num = floatval($amount);
        if ($num == 0) {
            return "صفر $currency فقط لا غير";
        }

        $isNegative = $num < 0;
        $num = abs($num);

        $intPart = intval(floor($num));
        $decPart = intval(round(($num - $intPart) * 100));

        $words = [];

        if ($intPart > 0) {
            $billions = intdiv($intPart, 1000000000);
            $millions = intdiv($intPart % 1000000000, 1000000);
            $thousands = intdiv($intPart % 1000000, 1000);
            $units = $intPart % 1000;

            if ($billions > 0) {
                if ($billions === 1) $words[] = 'مليار';
                elseif ($billions === 2) $words[] = 'ملياران';
                elseif ($billions >= 3 && $billions <= 10) $words[] = self::convertChunk($billions) . ' مليارات';
                else $words[] = self::convertChunk($billions) . ' مليار';
            }

            if ($millions > 0) {
                if ($millions === 1) $words[] = 'مليون';
                elseif ($millions === 2) $words[] = 'مليونان';
                elseif ($millions >= 3 && $millions <= 10) $words[] = self::convertChunk($millions) . ' ملايين';
                else $words[] = self::convertChunk($millions) . ' مليون';
            }

            if ($thousands > 0) {
                if ($thousands === 1) $words[] = 'ألف';
                elseif ($thousands === 2) $words[] = 'ألفان';
                elseif ($thousands >= 3 && $thousands <= 10) $words[] = self::convertChunk($thousands) . ' آلاف';
                else $words[] = self::convertChunk($thousands) . ' ألف';
            }

            if ($units > 0) {
                $words[] = self::convertChunk($units);
            }
        }

        $intText = implode(' و', $words);
        $result = $intText ? ($intText . ' ' . $currency) : '';

        if ($decPart > 0) {
            $decText = self::convertChunk($decPart);
            if (!empty($result)) {
                $result .= ' و' . $decText . ' ' . $subUnit;
            } else {
                $result = $decText . ' ' . $subUnit;
            }
        }

        $prefix = $isNegative ? 'سالب ' : '';
        return 'فقط ' . $prefix . trim($result) . ' لا غير';
    }
}
