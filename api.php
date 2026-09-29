<?php
declare(strict_types=1);
require_once '/var/lib/rahul-security/bootstrap.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$dataDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$dataFile = $dataDir . DIRECTORY_SEPARATOR . 'meal-planner.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode(defaultData(), JSON_PRETTY_PRINT));
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo readData($dataFile);
    exit;
}

if ($method === 'POST') {
    home_same_origin();
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput ?: '', true);

    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload.']);
        exit;
    }

    if (!isset($payload['meals'], $payload['assignments']) || !is_array($payload['meals']) || !is_array($payload['assignments'])) home_fail(400,'Invalid planner data.');
    foreach ($payload['meals'] as $meal) {
        if (!is_array($meal)) home_fail(400,'Invalid meal.');
        foreach (['id','name','notes','createdAt'] as $key) if (isset($meal[$key]) && !is_scalar($meal[$key])) home_fail(400,'Invalid meal field.');
    }
    foreach ($payload['assignments'] as $value) {
        if (is_string($value)) {
            continue;
        }
        if (!is_array($value) || count($value) > 2) {
            home_fail(400, 'Invalid assignment.');
        }
        foreach ($value as $mealId) {
            if (!is_string($mealId)) {
                home_fail(400, 'Invalid assignment.');
            }
        }
    }
    if (count($payload['meals'] ?? [])>500 || count($payload['assignments'] ?? [])>10000) home_fail(400,'Planner is too large.');
    $meals = normalizeMeals($payload['meals'] ?? []);
    if (hasDuplicateMealNames($meals)) {
        home_fail(409, 'This meal is already saved.');
    }
    $data = [
        'meals' => $meals,
        'assignments' => normalizeAssignments($payload['assignments'] ?? []),
        'updatedAt' => gmdate('c'),
    ];

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($dataFile, $json, LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Unable to save meal planner data.']);
        exit;
    }

    echo $json;
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed.']);

function defaultData(): array
{
    return [
        'meals' => [],
        'assignments' => new stdClass(),
        'updatedAt' => gmdate('c'),
    ];
}

function readData(string $dataFile): string
{
    $json = file_get_contents($dataFile);
    if ($json === false || trim($json) === '') {
        return json_encode(defaultData(), JSON_PRETTY_PRINT);
    }

    json_decode($json, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return json_encode(defaultData(), JSON_PRETTY_PRINT);
    }

    return $json;
}

function normalizeMeals(mixed $meals): array
{
    if (!is_array($meals)) {
        return [];
    }

    $cleanMeals = [];
    foreach ($meals as $meal) {
        if (!is_array($meal)) {
            continue;
        }

        $id = trim((string)($meal['id'] ?? ''));
        $name = trim((string)($meal['name'] ?? ''));
        if ($id === '' || $name === '') {
            continue;
        }

        $cleanMeals[] = [
            'id' => truncateText($id, 80),
            'name' => truncateText($name, 80),
            'notes' => truncateText(trim((string)($meal['notes'] ?? '')), 500),
            'createdAt' => truncateText((string)($meal['createdAt'] ?? gmdate('c')), 40),
        ];
    }

    return $cleanMeals;
}

function hasDuplicateMealNames(array $meals): bool
{
    $seen = [];
    foreach ($meals as $meal) {
        $name = preg_replace('/\s+/u', ' ', trim($meal['name'])) ?? trim($meal['name']);
        $key = function_exists('mb_strtolower') ? mb_strtolower($name, 'UTF-8') : strtolower($name);
        if (isset($seen[$key])) {
            return true;
        }
        $seen[$key] = true;
    }
    return false;
}

function normalizeAssignments(mixed $assignments): object
{
    if (!is_array($assignments)) {
        return new stdClass();
    }

    $cleanAssignments = [];
    foreach ($assignments as $slot => $value) {
        $slotKey = trim((string)$slot);
        if (preg_match('/^\d{4}-\d{2}-\d{2}:(breakfast|lunch|dinner)$/', $slotKey) !== 1) {
            continue;
        }

        $ids = is_array($value) ? $value : [$value];
        $cleanIds = [];
        foreach (array_slice($ids, 0, 2) as $id) {
            $mealId = truncateText(trim((string)$id), 80);
            if ($mealId !== '' && !in_array($mealId, $cleanIds, true)) {
                $cleanIds[] = $mealId;
            }
        }

        if (count($cleanIds) === 1) {
            $cleanAssignments[$slotKey] = $cleanIds[0];
        } elseif (count($cleanIds) === 2) {
            $cleanAssignments[$slotKey] = $cleanIds;
        }
    }

    return (object)$cleanAssignments;
}

function truncateText(string $value, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $length);
    }

    return substr($value, 0, $length);
}
