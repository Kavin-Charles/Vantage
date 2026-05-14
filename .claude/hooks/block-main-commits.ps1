$raw = [Console]::In.ReadToEnd()
try {
    $j = $raw | ConvertFrom-Json
    if ($j.tool_input.command -match 'git\s+commit') {
        $b = (& git branch --show-current 2>$null)
        if ($b) { $b = $b.Trim() }
        if ($b -eq 'main' -or $b -eq 'master') {
            $out = [pscustomobject]@{
                continue   = $false
                stopReason = 'Direct commits to main are blocked. Create a feature branch first: git checkout -b feat/your-feature'
            } | ConvertTo-Json -Compress
            Write-Output $out
        }
    }
} catch {}
