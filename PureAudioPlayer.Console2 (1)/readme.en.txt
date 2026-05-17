Pure Audio Player Console 2
by Oleg Samsonov
(C) 2025   All rights reserved
https://pureaudioplayer.ru

Optimized software audio player for Windows 10+ with DSD, SACD ISO and popular lossless formats support

# Supported start commands:

1. Play folder or file
   > PureAudioPlayer.Console.exe [apscream|scream] [shuffle] "folder or file"
   - apscream or scream - Album Player (ap) or original Scream output.
     (default Scream 32 bit output: multicast to defaultIP:4010, default apscream: unicast to xxx.xxx.xxx.77:4011)
     (config: "scream/16", "scream/24" - 16 or 24 bit output, "apscream/xxx.xxx.xxx.xxx/16" - unicast IP and 16 bit output).
   - shuffle - shuffle play command.
   - folder or file - reletive or full path to folder with music or audio file or .m3u playlist.

2. Add to play folder or file
   > PureAudioPlayer.Console.exe add "folder or file"
   - folder or file - reletive or full path to folder with music or audio file or .m3u playlist.

3. Set windows integrations
   > PureAudioPlayer.Console.exe
   Run as Administrator.

4. Del windows integrations
   > PureAudioPlayer.Console.exe uninstall
   Run as Administrator.

# Controls:

Escape - exit from programm.
Enter - next file.
Backspace - previous file.
Space - pause or resume playing.
Arrows - file movements.

# Configaration:

Configuration file is stored in program folder with PureAudioPlayer.Console.json filename in JSON format and UTF-8 encoding.

Supported:
 * selection of preferred audio device by parameter "Asio", "Wasapi" and "Scream".
 * disabling devices "Asio", "Wasapi", "Scream" by parameter "Disabled".
 * selecting sample rates by parameter "SampleRate" and key "PCM", "DSD" or "DoP" as array of values.

File body example for Asio: { "Asio": "Cayin ASIO Driver", "Disabled": "Wasapi" }
File body example for Wasapi: { "Disabled": "Asio, Scream", "Wasapi": "Speakers (aune USB DAC)" }
File body example for Scream: { "Disabled": "Asio, Wasapi", "Scream": "apscream/192.168.1.11/24" }
File body example for sample rates: { "SampleRate": { "PCM": [ 44100, 48000, 96000, 192000 ], "DoP": [ 176400 ] } }