$ErrorActionPreference = 'Stop'
$testDir = $PSScriptRoot
$elf = Join-Path $env:TEMP 'free-retro-rtc-fixture.elf'
& 'C:\devkitPro\devkitARM\bin\arm-none-eabi-gcc.exe' '-mthumb' '-mthumb-interwork' '-O2' '-specs=C:/devkitPro/devkitARM/arm-none-eabi/lib/gba.specs' '-IC:/devkitPro/libgba/include' '-LC:/devkitPro/libgba/lib' (Join-Path $testDir 'rtc-fixture.c') '-lgba' '-o' $elf
if ($LASTEXITCODE) { throw 'RTC ROM compile failed' }
$rom = Join-Path $testDir 'rtc-fixture.gba'
& 'C:\devkitPro\devkitARM\bin\arm-none-eabi-objcopy.exe' '-O' 'binary' $elf $rom
if ($LASTEXITCODE) { throw 'RTC ROM objcopy failed' }
& 'C:\devkitPro\tools\bin\gbafix.exe' $rom '-tFREERTC' '-cAXVE'
if ($LASTEXITCODE) { throw 'RTC ROM header failed' }
Write-Output "Original RTC ROM built: $rom"
