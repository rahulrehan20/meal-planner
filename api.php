<?php
declare(strict_types=1);

header('Content-Type: application/json');

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
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput ?: '', true);

    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload.']);
        exit;
    }

    $data = [
        'meals' => normalizeMeals($payload['meals'] ?? []),
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
            'id' => mb_substr($id, 0, 80),
            'name' => mb_substr($name, 0, 80),
            'notes' => mb_substr(trim((string)($meal['notes'] ?? '')), 0, 500),
            'createdAt' => mb_substr((string)($meal['createdAt'] ?? gmdate('c')), 0, 40),
        ];
    }

    return $cleanMeals;
}

function normalizeAssignments(mixed $assignments): object
{
    if (!is_array($assignments)) {
        return new stdClass();
    }

    $cleanAssignments = [];
    foreach ($assignments as $slot => $mealId) {
        $slotKey = trim((string)$slot);
        $mealKey = trim((string)$mealId);

        if (preg_match('/^\d{4}-\d{2}-\d{2}:(breakfast|lunch|dinner)$/', $slotKey) !== 1 || $mealKey === '') {
            continue;
        }

        $cleanAssignments[$slotKey] = mb_substr($mealKey, 0, 80);
    }

    return (object)$cleanAssignments;
}
