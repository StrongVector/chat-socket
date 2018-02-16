const server = require('http').createServer()
const io = require('socket.io')(server)

server.listen(3000, function(err) {
  if (err) throw err
  console.log('listening on port 3000')
})

function createChatroom(name) {
  const members = new Set()

  function broadcast(code, msg) {
    Array.from(members)
      .map(clientId => clients.get(clientId))
      .filter(c => !!c)
      .forEach(
        m => m.client.emit(code, msg)
      )
  }

  return { name, members, broadcast }
}

const chatrooms = new Map(
  require('./config/chatrooms').map((chatroom, id) => [id, createChatroom(chatroom.name)])
)

const users = require('./config/users')

const clients = new Map()

function getAvailableUsers() {
  const usersTaken = new Set(Array.from(clients.values()).filter(c => c.user).map(c => c.user.name))
  return users
    .filter(u => !usersTaken.has(u.name))
}

function isUserAvailable(userName) {
  return getAvailableUsers().some(u => u.name === userName)
}

function getUser(userName) {
  return users.find(u => u.name === userName)
}

io.on('connection', function(client) {
  console.log('client connected...', client.id)
  clients.set(client.id, { client })

  client.on('register', function(userName, callback) {
    if (!isUserAvailable(userName))
      return callback('user is not available')

    const user = getUser(userName)
    clients.set(client.id, { client, user })

    return callback(null, user)
  })

  client.on('join', function(chatroomId, cb) {
    const c = clients.get(client.id)
    if (!c || !c.user) {
      return callback('select user first')
    }

    const chatroom = chatrooms.get(chatroomId)
    if (!chatroom)
      return callback('invalid chatroom id')

    if (chatroom.members.has(client.id))
      return callback(null)

    // notify other clients in chatroom
    chatroom.broadcast('joined', { chat: chatroom.name, user: c.user.name })

    // add member to chatroom
    chatroom.members.add(client.id)

    return callback(null)
  })

  client.on('leave', function(chatroomId, callback) {
    const chatroom = chatrooms.get(chatroomId)
    if (!chatroom)
      return callback('invalid chatroom id')

    if (!chatroom.members.has(client.id))
      return callback(null)

    // notify other clients in chatroom
    chatroom.broadcast('left', { chat: chatroom.name, user: clients.get(client.id).user.name })

    // remove member from chatroom
    chatroom.members.delete(client.id)

    return callback(null)
  })

  client.on('message', function({ chatroomId, message } = {}, callback) {
    if (!data.chatroomId || ! data.message)
      return callback('expected chatroomId and message')

    const chatroom = chatrooms.get(chatroomId)
    if (!chatroom)
      return callback('invalid chatroom id')

    chatroom.broadcast('message', message)

    return callback(null)
  })

  client.on('chatrooms', function(_, callback) {
    return callback(null, Array.from(chatrooms.values()))
  })

  client.on('availableUsers', function(_, callback) {
    return callback(null, getAvailableUsers())
  })

  client.on('disconnect', function() {
    console.log('client disconnect...', client.id)
    // remove user profile
    clients.delete(client.id)
    // remove member from all chatrooms
    chatrooms.forEach(c => c.members.delete(client.id))
  })

  client.on('error', function(err) {
    console.log('received error from client:', client.id)
    console.log(err)
  })
})