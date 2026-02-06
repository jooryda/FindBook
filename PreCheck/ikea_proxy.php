<?php
// ikea_proxy.php
// Simple proxy to fetch IKEA product title/description by article number
// Usage: /ikea_proxy.php?article=502.981.02

header('Content-Type: application/json; charset=utf-8');

$article = $_GET['article'] ?? '';
$article = preg_replace('/[^0-9.]/', '', $article);

if (!$article) {
  http_response_code(400);
  echo json_encode(['error' => 'article required']);
  exit;
}

// IKEA uses article without dots in URL
$articleNoDots = str_replace('.', '', $article);
$url = "https://www.ikea.com/kr/ko/p/-{$articleNoDots}/";

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT => 10,
  CURLOPT_USERAGENT => 'Mozilla/5.0 (PrenoteCheck)'
]);

$html = curl_exec($ch);
curl_close($ch);

if (!$html) {
  http_response_code(500);
  echo json_encode(['error' => 'fetch failed']);
  exit;
}

// Try to extract title & description from meta tags
$title = '';
$desc = '';

if (preg_match('/<title>(.*?)<\/title>/si', $html, $m)) {
  $title = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

if (preg_match('/<meta\s+name="description"\s+content="(.*?)"/si', $html, $m)) {
  $desc = trim(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

echo json_encode([
  'article' => $article,
  'title' => $title,
  'description' => $desc,
  'source' => $url
]);
