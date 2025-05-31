import React, { useState, useEffect, useRef, useCallback } from 'react'

// Compact ASCII numbers for mobile
const compactAsciiNumbers: Record<string, string[]> = {
  '0': ['╔═╗', '║ ║', '╚═╝'],
  '1': [' ╗ ', ' ║ ', ' ╩ '],
  '2': ['╔═╗', '╔═╝', '╚══'],
  '3': ['╔═╗', ' ═╣', '╚═╝'],
  '4': ['╦ ╦', '╚═╣', '  ╩'],
  '5': ['╔══', '╚═╗', '╚═╝'],
  '6': ['╔═ ', '╠═╗', '╚═╝'],
  '7': ['╔═╗', '  ║', '  ╩'],
  '8': ['╔═╗', '╠═╣', '╚═╝'],
  '9': ['╔═╗', '╚═╣', ' ═╝'],
  ':': [' ', ':', ' ']
}

const asciiNumbers: Record<string, string[]> = {
  '0': [
    "   ____    ",
    "  / __ \\   ",
    " / / / /   ",
    "/ /_/ /    ",
    "\\____/     "
  ],
  '1': [
    "   ___     ",
    "  <  /     ",
    "  / /      ",
    " / /       ",
    "/_/        "
  ],
  '2': [
    " ___       ",
    "|__ \\      ",
    "__/ /      ",
    "/ __/      ",
    "/____/     "
  ],
  '3': [
    " _____     ",
    "|__  /     ",
    "  /_ <     ",
    "___/ /     ",
    "/____/     "
  ],
  '4': [
    "__ __      ",
    "/ // /     ",
    "/ // /_    ",
    "/__  __/   ",
    "  /_/      "
  ],
  '5': [
    " ______    ",
    "/ ____/    ",
    "/___ \\     ",
    "____/ /    ",
    "/_____/    "
  ],
  '6': [
    " _____     ",
    "/ ___/     ",
    "/ __ \\     ",
    "/ /_/ /    ",
    "\\____/     "
  ],
  '7': [
    " _____     ",
    "/__  /     ",
    "  / /      ",
    " / /       ",
    "/_/        "
  ],
  '8': [
    " ____      ",
    "( __ )     ",
    "/ __  |    ",
    "/ /_/ /    ",
    "\\____/     "
  ],
  '9': [
    " ____      ",
    "/ __ \\     ",
    "/ /_/ /    ",
    "\\__, /     ",
    "/____/     "
  ],
  ':': [
    "   _       ",
    "  (_)      ",
    "   _       ",
    "  (_)      ",
    "           "
  ]
}

// Animation frames showing sparks traveling from both computers to meet in the middle
const activeFrames = [
  // Frame 1 - Start position
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_............*..............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 2 - Sparks start from both sides
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_^...........*..............^_|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 3
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_.^..........*.............^._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 4
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_..^.........*............^.._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 5
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_...^........*...........^..._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 6
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_....^.......*..........^...._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 7
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_.....^......*.........^....._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 8
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_......^.....*........^......_|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 9
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_.......^....*.......^......._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 10
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_........^...*......^........_|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 11
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_.........^..*.....^........._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 12
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_..........^.*...^..........._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 13
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_...........^*..^............_|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 14 - Sparks meet at center
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_...........^*^.............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 15 - Big spark explosion
  [
    "   _______________     ***     ***        |*\\_/*|________",
    "  |  ___________  |    *^^^** **^^^*     ||_/-\\_|______  |",
    "  | |           | |   *^****^*^****^*    | |           | |",
    "  | | ' @   @   | |   *^*****^*****^*    | |   *   * ' | |",
    "  | |     -     | |    *^*********^*     | |     -     | |",
    "  | |   \\___/   | |     *^*******^*      | |   \\___/   | |",
    "  | |___     ___| |      *^*****^*       | |___________| |",
    "  |_____|\\_/|_____|       *^***^*        |_______________|",
    "    _|__|/ \\|_|_..........*^*^*............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 16 - Spark continues
  [
    "   _______________     ***     ***        |*\\_/*|________",
    "  |  ___________  |    *^^^** **^^^*     ||_/-\\_|______  |",
    "  | |           | |   *^****^*^****^*    | |           | |",
    "  | | ' @   @   | |   *^*****^*****^*    | |   *   * ' | |",
    "  | |     -     | |    *^*********^*     | |     -     | |",
    "  | |   \\___/   | |     *^*******^*      | |   \\___/   | |",
    "  | |___     ___| |      *^*****^*       | |___________| |",
    "  |_____|\\_/|_____|       *^***^*        |_______________|",
    "    _|__|/ \\|_|_..........*^*^*............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 17 - Return to normal
  [
    "   _______________                        |*\\_/*|________",
    "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
    "  | |           | |    .****. .****.     | |           | |",
    "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
    "  | |     -     | |     .*********.      | |     -     | |",
    "  | |   \\___/   | |      .*******.       | |   \\___/   | |",
    "  | |___     ___| |       .*****.        | |___________| |",
    "  |_____|\\_/|_____|        .***.         |_______________|",
    "    _|__|/ \\|_|_............*..............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 18 - Another spark
  [
    "   _______________     ***     ***        |*\\_/*|________",
    "  |  ___________  |    *^^^** **^^^*     ||_/-\\_|______  |",
    "  | |           | |   *^****^*^****^*    | |           | |",
    "  | | ' @   @   | |   *^*****^*****^*    | |   *   * ' | |",
    "  | |     -     | |    *^*********^*     | |     -     | |",
    "  | |   \\___/   | |     *^*******^*      | |   \\___/   | |",
    "  | |___     ___| |      *^*****^*       | |___________| |",
    "  |_____|\\_/|_____|       *^***^*        |_______________|",
    "    _|__|/ \\|_|_..........*^*^*............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ],
  // Frame 19 - Final spark
  [
    "   _______________     ***     ***        |*\\_/*|________",
    "  |  ___________  |    *^^^** **^^^*     ||_/-\\_|______  |",
    "  | |           | |   *^****^*^****^*    | |           | |",
    "  | | ' @   @   | |   *^*****^*****^*    | |   *   * ' | |",
    "  | |     -     | |    *^*********^*     | |     -     | |",
    "  | |   \\___/   | |     *^*******^*      | |   \\___/   | |",
    "  | |___     ___| |      *^*****^*       | |___________| |",
    "  |_____|\\_/|_____|       *^***^*        |_______________|",
    "    _|__|/ \\|_|_..........*^*^*............._|________|_",
    "   / ********** \\                          / ********** \\",
    " /  ************  \\                      /  ************  \\",
    "--------------------                    --------------------"
  ]
]

const inactiveFrame = [
  "   _______________                        |*\\_/*|________",
  "  |  ___________  |     .-.     .-.      ||_/-\\_|______  |",
  "  | |           | |    .****. .****.     | |           | |",
  "  | |   0   0   | |    .*****.*****.     | |   0   0   | |",
  "  | |     -     | |     .*********.      | |     -     | |",
  "  | |   _____   | |      .*******.       | |   _____   | |",
  "  | |___     ___| |       .*****.        | |___________| |",
  "  |_____|\\_/|_____|        .***.         |_______________|",
  "    _|__|/ \\|_|_............*..............._|________|_",
  "   / ********** \\                          / ********** \\",
  " /  ************  \\                      /  ************  \\",
  "--------------------                    --------------------"
]

interface WorkTimerProps {
  className?: string
}

export default function WorkTimer({ className = '' }: WorkTimerProps) {
  const [isActive, setIsActive] = useState(true)
  const [activeTime, setActiveTime] = useState(0)
  const [inactiveTime, setInactiveTime] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const lastToggleRef = useRef(Date.now())

  useEffect(() => {
    setIsVisible(true)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = (now - lastToggleRef.current) / 1000

      if (isActive) {
        setActiveTime(prev => prev + elapsed)
      } else {
        setInactiveTime(prev => prev + elapsed)
      }
      lastToggleRef.current = now

      if (isActive) {
        setFrameIndex((prev) => (prev + 1) % activeFrames.length)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [isActive])

  const toggleState = useCallback(() => {
    setIsActive(!isActive)
  }, [isActive])

  // Add keyboard event listeners
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault() // Prevent page scroll
        toggleState()
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      }
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault()
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [toggleState, isFullscreen])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen)
  }, [isFullscreen])

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Check if viewport is small (mobile)
  const [isSmallScreen, setIsSmallScreen] = useState(false)
  
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 640 || window.innerHeight < 500)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  const convertToAsciiArt = (timeStr: string): string[] => {
    const result = ['', '', '', '', '']
    
    for (const char of timeStr) {
      if (char in asciiNumbers) {
        for (let i = 0; i < 5; i++) {
          result[i] += asciiNumbers[char][i]
        }
      }
    }
    
    return result
  }

  const convertToCompactAscii = (timeStr: string): string[] => {
    const result = ['', '', '']
    
    for (const char of timeStr) {
      if (char in compactAsciiNumbers) {
        for (let i = 0; i < 3; i++) {
          result[i] += compactAsciiNumbers[char][i]
        }
      }
    }
    
    return result
  }

  const currentFrame = isActive ? activeFrames[frameIndex] : inactiveFrame

  if (isFullscreen) {
    // Compact ASCII display for small screens - using YOUR animation style
    if (isSmallScreen) {
      return (
        <div className="fixed inset-0 bg-background z-50 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center p-3">
            <div className="font-mono text-center space-y-4 w-full">
              <div className="space-y-4">
                <div>
                  <div className="text-muted-foreground text-sm mb-2">Work Time</div>
                  <pre className="inline-block text-lg sm:text-xl">
                    {convertToCompactAscii(formatTime(activeTime)).join('\n')}
                  </pre>
                </div>
                
                <div>
                  <div className="text-muted-foreground text-sm mb-2">Break Time</div>
                  <pre className="inline-block text-lg sm:text-xl">
                    {convertToCompactAscii(formatTime(inactiveTime)).join('\n')}
                  </pre>
                </div>
              </div>
              
              {/* Your original computer animation, much bigger */}
              <div className="my-4 overflow-x-auto w-full px-2">
                <pre className="text-[8px] xs:text-[9px] sm:text-[10px] whitespace-pre leading-tight mx-auto inline-block">
                  {currentFrame.join('\n')}
                </pre>
              </div>
              
              <div className="text-sm font-semibold">
                {isActive ? 'WORKING' : 'NOT WORKING'}
              </div>
              
              <div className="flex flex-col gap-2 text-sm max-w-xs mx-auto">
                <button 
                  onClick={toggleState}
                  className="px-4 py-2 rounded bg-muted hover:bg-muted/80 transition-colors"
                >
                  <kbd className="px-2 py-1 text-xs border rounded">Space</kbd> toggle
                </button>
                <button 
                  onClick={toggleFullscreen}
                  className="px-4 py-2 rounded bg-muted hover:bg-muted/80 transition-colors"
                >
                  <kbd className="px-2 py-1 text-xs border rounded">Esc</kbd> exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Full ASCII display for larger screens
    return (
      <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center p-2">
        <div className="font-mono text-center w-full h-full flex flex-col justify-center max-w-[90vw]">
          {/* Timer displays */}
          <div className="space-y-2 md:space-y-4">
            <div>
              <div className="text-muted-foreground text-[10px] sm:text-xs md:text-sm">Work Time:</div>
              <pre className="inline-block text-[8px] sm:text-[12px] md:text-[16px] lg:text-[20px] xl:text-[24px]">
                {convertToAsciiArt(formatTime(activeTime)).join('\n')}
              </pre>
            </div>
            
            <div>
              <div className="text-muted-foreground text-[10px] sm:text-xs md:text-sm">Break Time:</div>
              <pre className="inline-block text-[8px] sm:text-[12px] md:text-[16px] lg:text-[20px] xl:text-[24px]">
                {convertToAsciiArt(formatTime(inactiveTime)).join('\n')}
              </pre>
            </div>
          </div>
          
          {/* Computer animation - scale based on viewport height and width */}
          <div className="my-2 md:my-4">
            <pre className="text-[5px] sm:text-[7px] md:text-[9px] lg:text-[11px] xl:text-[13px] whitespace-pre leading-tight">
              {currentFrame.join('\n')}
            </pre>
          </div>
          
          {/* Controls */}
          <div className="text-muted-foreground space-y-1">
            <div className="text-[10px] sm:text-xs md:text-sm">
              State: <span className="font-semibold">{isActive ? 'WORKING' : 'NOT WORKING'}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
              <button 
                onClick={toggleState}
                className="px-2 py-1 rounded hover:bg-muted transition-colors inline-flex items-center gap-1"
              >
                Press <kbd className="px-1 py-0.5 text-[9px] sm:text-[10px] border rounded">Space</kbd> to toggle
              </button>
              <button 
                onClick={toggleFullscreen}
                className="px-2 py-1 rounded hover:bg-muted transition-colors inline-flex items-center gap-1"
              >
                Press <kbd className="px-1 py-0.5 text-[9px] sm:text-[10px] border rounded">F</kbd> or <kbd className="px-1 py-0.5 text-[9px] sm:text-[10px] border rounded">Esc</kbd> to exit
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${className} font-mono transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="text-center space-y-2 w-full">
        <div className="space-y-4 mb-4">
          <div>
            <div className="text-muted-foreground mb-1 text-xs sm:text-sm">Work Time:</div>
            <pre className="inline-block text-[6px] xs:text-[7px] sm:text-[9px]">
              {convertToAsciiArt(formatTime(activeTime)).join('\n')}
            </pre>
          </div>
          
          <div>
            <div className="text-muted-foreground mb-1 text-xs sm:text-sm">Break Time:</div>
            <pre className="inline-block text-[6px] xs:text-[7px] sm:text-[9px]">
              {convertToAsciiArt(formatTime(inactiveTime)).join('\n')}
            </pre>
          </div>
        </div>
        
        <div className="overflow-x-hidden pb-2">
          <pre className="text-[6px] xs:text-[7px] sm:text-[8px] md:text-[10px] lg:text-xs whitespace-pre">
            {currentFrame.join('\n')}
          </pre>
        </div>
        
        <div className="text-muted-foreground text-xs sm:text-sm">
          State: <span className="font-semibold">{isActive ? 'WORKING' : 'NOT WORKING'}</span>
          <br className="sm:hidden" />
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            <button 
              onClick={toggleState}
              className="px-2 py-1 rounded hover:bg-muted transition-colors inline-flex items-center gap-1"
            >
              Press <kbd className="px-1.5 py-0.5 text-xs border rounded">Space</kbd> to toggle
            </button>
            <button 
              onClick={toggleFullscreen}
              className="px-2 py-1 rounded hover:bg-muted transition-colors inline-flex items-center gap-1"
            >
              Press <kbd className="px-1.5 py-0.5 text-xs border rounded">F</kbd> for focus
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}