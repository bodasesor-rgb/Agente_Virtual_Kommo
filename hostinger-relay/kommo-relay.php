<?php
/**
 * Buzón de respaldo de Lucy: recibe una copia del webhook de mensajes de Kommo y la
 * guarda en la carpeta persistente de Lucy. Corre en un sitio PHP aparte para seguir
 * recibiendo aunque el proceso Node de Lucy esté caído. Lucy lo lee al mover un lead
 * manualmente a "Datos e Intereses" (services/kommoRelay.ts).
 *
 * En el servidor se publica con un nombre de archivo aleatorio (ese nombre es el secreto).
 */

const LUCY_RELAY_DIR = '/home/u353783185/domains/midnightblue-mosquito-424375.hostingersite.com/persistent/lucy-data/kommo-relay';
const KEEP_DAYS = 3;

header('Content-Type: application/json');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    echo '{"ok":true}';
    exit;
}

$body = $_POST;
if (!$body) {
    $json = json_decode((string) file_get_contents('php://input'), true);
    $body = is_array($json) ? $json : [];
}

$entries = [];
foreach (['message', 'messages'] as $root) {
    $add = $body[$root]['add'] ?? null;
    if (is_array($add)) {
        foreach ($add as $m) {
            if (is_array($m)) $entries[] = $m;
        }
    }
}

if ($entries) {
    if (!is_dir(LUCY_RELAY_DIR)) @mkdir(LUCY_RELAY_DIR, 0755, true);
    $lines = '';
    foreach ($entries as $m) {
        $lines .= json_encode([
            'received_at' => time(),
            'id' => (string) ($m['id'] ?? ''),
            'lead_id' => (string) ($m['entity_id'] ?? $m['element_id'] ?? ''),
            'talk_id' => (string) ($m['talk_id'] ?? ''),
            'chat_id' => (string) ($m['chat_id'] ?? ''),
            'contact_id' => (string) ($m['contact_id'] ?? ''),
            'type' => (string) ($m['type'] ?? ''),
            'author_type' => (string) ($m['author']['type'] ?? ''),
            'text' => (string) ($m['text'] ?? ''),
            'attachment_type' => (string) ($m['attachment']['type'] ?? ''),
            'created_at' => (int) ($m['created_at'] ?? time()),
        ], JSON_UNESCAPED_UNICODE) . "\n";
    }
    @file_put_contents(LUCY_RELAY_DIR . '/' . gmdate('Y-m-d') . '.jsonl', $lines, FILE_APPEND | LOCK_EX);

    foreach (glob(LUCY_RELAY_DIR . '/*.jsonl') ?: [] as $f) {
        if (filemtime($f) < time() - KEEP_DAYS * 86400) @unlink($f);
    }
}

echo '{"ok":true}';
