const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server: IOServer } = require('socket.io')
const io = new IOServer(server)
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

app.use(express.json());
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))

const STORAGE_PATH = path.resolve(__dirname, '../storage/users.json')

const PUBLIC_PATH = path.resolve(__dirname, '../public')


app.get('/',(req,res) => {
  res.sendFile(path.resolve(PUBLIC_PATH, 'index.html'))
})

// register
app.post('/user',(req, res) => {
  const { username, password } = req.body
  const users = JSON.parse(fs.readFileSync(STORAGE_PATH))
  let user = users.find(user => user.username === username)
  if (user) res.status(4001).json({ message: 'user already exist' })
  user = {
    username,
    password,
    id: crypto.randomUUID()
  } 
  users.push(user)
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(users, undefined, 2))
  res.status(201).json(user)
  
})
const rooms = []
const matches = {}
// auth
app.post('/login',(req, res) => {
  const { username, password } = req.body
  const users = JSON.parse(fs.readFileSync(STORAGE_PATH))
  let user = users.find(user => user.username === username)
  if (!user) {
    res.status(404).json({ message: 'user not found' })
  }
  if (user.password !== password) res.status(401).json({ message: 'wrong password' })
  return res.status(200).json(user)
  
})
const gameWidth = 700 
const gameHeight = 700
const GLOBAL_CHAT_KEY = 'global-chat'
const characters = ['square', 'circle', 'triangle']
const CHAR_SIZE = 15
const BULLET_SIZE = 7

const charBaseStatus = {
  triangle: {
    hp: 9,
    damage: 1,
    nBullets: 10,
    bulletsCd: 500,
  },
  square: {
    hp: 15,
    damage: 4,
    nBullets: 8,
    specialDmg: 10,
    specialSize: 12,
    bulletsCd: 1000
  },
  circle: {
    hp: 10,
    damage: 2,
    nBullets: 15,
    bulletsCd: 900,
    specialSpeed: 1050
  }

}
const initGameState = (room) => {
  return {
    team1: {
      score: 0,
      triangle: {
        x: gameWidth / 2,
        y: gameHeight / 4,
        hp: charBaseStatus.triangle.hp,
        maxHp: charBaseStatus.triangle.hp,
        maxBullets: charBaseStatus.triangle.nBullets,
        nBullets: 0,
        bullets: []
      },
      circle: {
        x: gameWidth / 2,
        y: gameHeight / 4,
        hp: charBaseStatus.circle.hp,
        maxHp: charBaseStatus.circle.hp,
        maxBullets: charBaseStatus.circle.nBullets,
        nBullets: 0,
        bullets: []
      },
      square: {
        x: gameWidth / 2,
        y: gameHeight / 4,
        hp: charBaseStatus.square.hp,
        maxHp: charBaseStatus.square.hp,
        maxBullets: charBaseStatus.square.nBullets,
        nBullets: 0,
        bullets: []
      }
    },
    team2: {
      score: 0,
      triangle: {
        x: gameWidth / 2,
        y: (gameHeight / 4) * 3,
        hp: charBaseStatus.triangle.hp,
        maxHp: charBaseStatus.triangle.hp,
        maxBullets: charBaseStatus.triangle.nBullets,
        nBullets: 0,
        bullets: []
      },
      circle: {
        x: gameWidth / 2,
        y: (gameHeight / 4) * 3,
        hp: charBaseStatus.circle.hp,
        maxHp: charBaseStatus.circle.hp,
        maxBullets: charBaseStatus.circle.nBullets,
        nBullets: 0,
        bullets: []
      },
      square: {
        x: gameWidth / 2,
        y: (gameHeight / 4) * 3,
        hp: charBaseStatus.square.hp,
        maxHp: charBaseStatus.square.hp,
        maxBullets: charBaseStatus.square.nBullets,
        nBullets: 0,
        bullets: []
      }
    },
    currentMatch: 0,
    matches: []
  }
}
const minPlayers = 2
// TODO: refactor this function to check the number of players on each team
const isGameReadyToStart = (state) => {
  let nPLayers = 0
  characters.forEach(char => {
    nPLayers += Number(!!state.team1[char].userId) + Number(!!state.team2[char].userId)
  })
  return nPLayers >= minPlayers
}

const generateMatches = (gameState) => {
  const team1Chars = characters.filter(char => !!gameState.team1[char].userId)
  const team2Chars = characters.filter(char => !!gameState.team2[char].userId)
  const matches = []
  while (team1Chars.length > 0) {
    const [char1] = team1Chars.splice(Math.floor(Math.random() * team1Chars.length), 1)
    const [char2] = team2Chars.splice(Math.floor(Math.random() * team2Chars.length), 1)
    matches.push([char1, char2])
  }
  gameState.matches = matches
}

const getUserCharacter = (gameState, userId) => {
  const chatTeam1 = characters.find(char => {
    return gameState.team1[char].userId === userId
  })

  const chatTeam2 = characters.find(char => {
    return gameState.team2[char].userId === userId
  })
  if (chatTeam1) return { team: 'team1', char: chatTeam1 }
  if (chatTeam2) return { team: 'team2', char: chatTeam2 }
}

const createMatch = (roomId, gameState, onMatchEnd) => {
  const [char1, char2] = gameState.matches[gameState.currentMatch]
  return {
    state: gameState,
    char1: gameState.team1[char1],
    char2: gameState.team2[char2],
    shot: function ({ team }) {
      const char = team === 1 ? this.char1 : this.char2
      const shape = team === 1 ? char1 : char2
      if (char.nBullets === char.maxBullets || char.specialActive) {
        const bullet = {
          x: char.x,
          y: char.y,
          special: true,
        }
        if (shape === 'square') {
          bullet.size = charBaseStatus.square.specialSize
        }
        if (shape === 'triangle') {
          Array(8).fill(undefined).forEach((_, i) => {
            char.bullets.push({
              x: char.x - 35 + (i * 20),
              y: char.y,
              special: true,
            })
          })
        } else {
          char.bullets.push(bullet)
        }
        shape === 'circle' && char.nBullets === char.maxBullets && (char.specialActive = true)
        char.nBullets = shape === 'circle' ? char.nBullets - 1 : 0
      } else if (char.nBullets) {
        char.bullets.push({
          x: char.x,
          y: char.y,
        })
        char.nBullets -= 1
      }

      if (shape === 'circle' && char.nBullets === 0 && char.specialActive) {
        char.specialActive = false
      }
    },
    lastFrameTime: undefined,
    char1Cooldown: undefined,
    char2Cooldown: undefined,
    frame: function () {
      const now = Date.now()
      const delta = (now - this.lastFrameTime) / 1000

      this.char1.bullets = this.char1.bullets.filter(bullet =>  {
        const size = bullet.special && char1 === 'square' ? charBaseStatus.square.specialSize : BULLET_SIZE
        const distance = Math.sqrt(((this.char2.x - bullet.x) ** 2) + ((this.char2.y - bullet.y) ** 2))
        const bulletHit = distance <= CHAR_SIZE + (size / 2)
        const dmg = bullet.special && char1 === 'square' ? charBaseStatus.square.specialDmg : charBaseStatus[char1].damage
        if (bulletHit) this.char2.hp = Math.max(this.char2.hp - dmg, 0)
        const isVisible = bullet.y < gameHeight
        return isVisible && !bulletHit
      })

      this.char2.bullets = this.char2.bullets.filter(bullet => {
        const size = bullet.special && char2 === 'square' ? charBaseStatus.square.specialSize : BULLET_SIZE
        const distance = Math.sqrt(((this.char1.x - bullet.x) ** 2) + ((this.char1.y - bullet.y) ** 2))
        const bulletHit = distance <= CHAR_SIZE + (size / 2)
        const dmg = bullet.special && char2 === 'square' ? charBaseStatus.square.specialDmg : charBaseStatus[char2].damage
        if (bulletHit) this.char1.hp = Math.max(this.char1.hp - dmg, 0)
        const isVisible = bullet.y > 0
        return isVisible && !bulletHit
      })

      if (this.char1.hp < 1 || this.char2.hp < 1) {
        this.end()
      }

      this.char1.bullets.forEach(bullet => {
        const speed = bullet.special && char1 === 'circle' ? charBaseStatus.circle.specialSpeed : 650
        bullet.y +=  speed * delta
      })
      this.char2.bullets.forEach(bullet => {
        const speed = bullet.special && char2 === 'circle' ? charBaseStatus.circle.specialSpeed : 650
        bullet.y -=  speed * delta
      })

      if (now - this.char1Cooldown >= charBaseStatus[char1].bulletsCd) {
        this.char1Cooldown = now
        if (char1 === 'circle' && this.char1.specialActive) return
        this.char1.nBullets = Math.min(this.char1.maxBullets, this.char1.nBullets + 1)
      }

      if (now - this.char2Cooldown >= charBaseStatus[char2].bulletsCd) {
        this.char2Cooldown = now
        if (char2 === 'circle' && this.char2.specialActive) return
        this.char2.nBullets = Math.min(this.char2.maxBullets, this.char2.nBullets + 1)
      }

      this.lastFrameTime = now
    },
    intervalRef: undefined,
    start: function () {
      this.lastFrameTime = Date.now()
      this.char1Cooldown = Date.now()
      this.char2Cooldown = Date.now()
      io.to(roomId).emit('gameStarted')
      io.to(roomId).emit('updateGameState', this.state)
      this.intervalRef = setInterval(() => {
        this.frame()
        io.to(roomId).emit('updateGameState', this.state)
        // 40 frames per second
      }, 1000 / 40)
    },
    end: function () {
      if (this.char1.hp > 0) {
        this.state.team1.score += 1
      } else {
        this.state.team2.score += 1
      }
      clearInterval(this.intervalRef)
      io.to(roomId).emit('matchEnd')
      io.to(roomId).emit('updateGameState', this.state)
      onMatchEnd()
    }
  }
}

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId
  let roomId
  console.log('user connected', socket.handshake.auth.userId)
  socket.join(GLOBAL_CHAT_KEY)
  socket.join(userId)
  socket.on('message', (message) => {
    socket.to(GLOBAL_CHAT_KEY).emit('message', message)
  })

  socket.on('newRoom', async (room) => {
    socket.to(GLOBAL_CHAT_KEY).emit('newRoom', { ...room, participants: [room.owner]})
    await socket.leave(GLOBAL_CHAT_KEY)
    const gameState = initGameState(room)
    // the current user don't need to join the new room because it's created with its id
    rooms.push({ ...room, participants: [room.owner], gameState })
    roomId = room.owner
    await socket.join(roomId)
    socket.emit('loadGameState', gameState)
  })

  // roomId is the owner id
  socket.on('joinRoom', async joinedRoomId => {
    roomId = joinedRoomId
    await socket.join(roomId)
    socket.to(roomId).to(GLOBAL_CHAT_KEY).emit('userJoined', { roomId, userId })
    await socket.leave(GLOBAL_CHAT_KEY)
    const room = rooms.find(room => room.owner === roomId)
    room.participants.push(userId)
    socket.emit('loadGameState', room.gameState)
  })

  socket.on('teamSelected', ({team, char, roomId}) => {
    socket.to(roomId).emit('teamSelected', { team, char, userId })
    const room = rooms.find(room => room.owner === roomId)
    const charName = characters[char]
    room.gameState[team === 0 ? 'team1' : 'team2'][charName].userId = userId
    if(isGameReadyToStart(room.gameState)) {
      generateMatches(room.gameState)
      const startNextMatch = () => {
        // if there's no other match
        if (!room.gameState.matches[room.gameState.currentMatch + 1]) {
          io.to(roomId).emit('gameEnd')
          const roomIndex = rooms.findIndex(room => room.owner === roomId)
          rooms.splice(roomIndex, 1)
          io.to(roomId).emit('updateRooms', rooms)
          io.in(roomId).socketsJoin(GLOBAL_CHAT_KEY)
          io.socketsLeave(roomId)
          roomId = undefined
          return
        }
        room.gameState.currentMatch += 1
        const match = createMatch(roomId, room.gameState, startNextMatch)
        matches[roomId] = match
        match.start()
      }
      const match = createMatch(roomId, room.gameState, startNextMatch)

      matches[roomId] = match
      match.start()
    }
  })

  socket.on('move', ({x, y}) => {
    const room = rooms.find(room => room.owner === roomId)
    if (!room) return
    const { team, char } = getUserCharacter(room.gameState, userId)
    room.gameState[team][char].x = x
    room.gameState[team][char].y = y
    socket.to(roomId).emit('updateGameState', room.gameState)
  })

  socket.on('shot', ({ team }) => {
    matches[roomId].shot({ team })
  })

  socket.emit('initialData', { rooms, charSize: CHAR_SIZE, charBaseStatus, bulletSize: BULLET_SIZE })
})


server.listen(3000, () => {
  console.log('listening on *:3000')
})