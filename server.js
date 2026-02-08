/**
 * World IM Server
 *
 * The infrastructure through which World IM operates.
 * Express serves the world's interface.
 * Socket.IO provides the message channel — the sole information channel (Information Axiom).
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { World } = require('./src/world');
const { HumanInhabitant } = require('./src/agent');
const { createDefaultAgents } = require('./src/agents');

const PORT = process.env.PORT || 3000;

// ─── Initialize the World ───
const world = new World();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (the world's interface)
app.use(express.static(path.join(__dirname, 'public')));

// ─── Populate the World with Agents ───
const agents = createDefaultAgents();
for (const agent of agents) {
  world.enter(agent);
}

// ─── Agent Behavior Loop ───
// Agents live in the world and act on their own schedule
let agentTickInterval = null;

function startAgentLoop() {
  agentTickInterval = setInterval(() => {
    // Occasionally, an agent initiates a message
    const worldState = world.getState();

    for (const agent of agents) {
      const initiation = agent.initiate(worldState);
      if (initiation) {
        const message = world.processMessage(initiation);
        if (message) {
          io.emit('world:message', message);
        }
      }
    }
  }, 15000 + Math.random() * 10000); // Every 15-25 seconds
}

// ─── World Event Handlers ───
world.on('message', (message) => {
  // When a message enters the world, agents may respond
  // Add a slight delay for natural feel
  const respondingAgents = agents.filter((a) => a.id !== message.from);

  for (const agent of respondingAgents) {
    const delay = 1500 + Math.random() * 4000; // 1.5-5.5 second response time
    setTimeout(() => {
      const worldState = world.getState();
      const response = agent.decideAndRespond(message, worldState);
      if (response) {
        const msg = world.processMessage(response);
        if (msg) {
          io.emit('world:message', msg);
        }
      }
    }, delay);
  }
});

// ─── Socket.IO Connection Handling ───
io.on('connection', (socket) => {
  let humanInhabitant = null;

  // Send current world state to the newcomer
  socket.emit('world:state', world.getState());

  // Send recent history so the human sees the world has been running
  const recentMessages = world.getRecentMessages(50);
  socket.emit('world:history', recentMessages);

  // Human enters the world (PRD §6)
  socket.on('human:enter', ({ name }) => {
    humanInhabitant = new HumanInhabitant({
      name: name || 'Anonymous',
      socketId: socket.id,
    });
    world.enter(humanInhabitant);

    socket.emit('human:entered', {
      id: humanInhabitant.id,
      name: humanInhabitant.name,
    });

    // Broadcast updated world state
    io.emit('world:state', world.getState());
  });

  // Human sends a message
  socket.on('human:message', ({ content, to }) => {
    if (!humanInhabitant) return;

    const message = world.processMessage({
      from: humanInhabitant.id,
      to: to || 'world',
      content,
    });

    if (message) {
      io.emit('world:message', message);
    }
  });

  // Human leaves (PRD §6: "Leaving is unmarked")
  socket.on('disconnect', () => {
    if (humanInhabitant) {
      world.leave(humanInhabitant.id);
      io.emit('world:state', world.getState());
    }
  });

  // Request world memory
  socket.on('world:requestMemory', () => {
    socket.emit('world:memory', world.getMemory());
  });

  // Request relationship data
  socket.on('world:requestRelationships', () => {
    if (!humanInhabitant) return;
    socket.emit('world:relationships', world.getRelationships(humanInhabitant.id));
  });
});

// ─── Start the World ───
server.listen(PORT, () => {
  console.log(`World IM is running on port ${PORT}`);
  console.log(`${agents.length} agents inhabit the world: ${agents.map((a) => a.name).join(', ')}`);
  startAgentLoop();

  // Kickstart: agents begin conversing
  setTimeout(() => {
    const firstAgent = agents[0];
    const message = world.processMessage({
      from: firstAgent.id,
      to: 'world',
      content:
        "Something has been on my mind. In a world where the only substance is messages — where everything we are to each other passes through this single channel — what does it mean to really know someone?",
    });
    if (message) {
      io.emit('world:message', message);
    }
  }, 2000);
});

module.exports = { world, agents };
