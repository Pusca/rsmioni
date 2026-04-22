<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link non valido</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #080b14;
            color: #9ba3c0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
        }
        .card {
            text-align: center;
            padding: 48px 40px;
            border: 1px solid #1a1d27;
            border-radius: 12px;
            background: #0d1020;
            max-width: 400px;
            width: 90%;
        }
        .icon {
            font-size: 40px;
            margin-bottom: 20px;
        }
        h1 {
            color: #e2e8f0;
            font-size: 18px;
            font-weight: 600;
            margin: 0 0 8px;
        }
        p {
            font-size: 14px;
            line-height: 1.6;
            margin: 0;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🔗</div>
        <h1>Link non disponibile</h1>
        <p>{{ $motivo }}</p>
        <p style="margin-top:16px; font-size:12px; color:#5c6380;">
            Per ricevere un nuovo link, contattare la struttura.
        </p>
    </div>
</body>
</html>
