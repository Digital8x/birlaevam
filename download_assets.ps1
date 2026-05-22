# PowerShell script to download image assets from source URL and save them in public/assets/images/

$TargetDir = "d:\birla network\birla-evam\public\assets\images"
if (!(Test-Path -Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir
}

# Image array with URLs and local target file names
$Images = @(
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/logo1.png"; File = "logo.png" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/About.webp"; File = "about.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2026/05/masterplan.webp"; File = "masterplan.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2026/05/birla-evam-project-location-image1-1375.jpg"; File = "location.jpg" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2026/05/2bhk_707_723.webp"; File = "2bhk.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2026/05/2bhk_xl_789_805.webp"; File = "2bhk_xl.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2026/05/3bhk_l_962_975.webp"; File = "3bhk_l.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/g6.webp"; File = "gallery_1.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/g4.webp"; File = "gallery_2.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/g2.webp"; File = "gallery_3.webp" },
    @{ Url = "https://birla-evam.virtual-tours.co.in/wp-content/uploads/2025/07/g1.webp"; File = "gallery_4.webp" },
    @{ Url = "https://birlaevamestate.com/images/qrcode.webp"; File = "rera_qr.webp" }
)

Write-Host "Starting asset download..."
foreach ($Img in $Images) {
    $FilePath = Join-Path -Path $TargetDir -ChildPath $Img.File
    Write-Host "Downloading $($Img.Url) -> $FilePath"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $Img.Url -OutFile $FilePath -TimeoutSec 30 -ErrorAction Stop
        Write-Host "Success!"
    } catch {
        Write-Host "Failed downloading $($Img.Url): $_" -ForegroundColor Yellow
        # Try fallback using curlimages if needed, or webclient
        try {
            $webclient = New-Object System.Net.WebClient
            $webclient.DownloadFile($Img.Url, $FilePath)
            Write-Host "Success! (WebClient Fallback)"
        } catch {
            Write-Host "WebClient fallback also failed: $_" -ForegroundColor Red
        }
    }
}
Write-Host "Completed asset download phase."
