import * as axios from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';

const { context = {} } = github;
const { pull_request, head_commit } = context.payload;

const regexPullRequest = /Merge pull request \#\d+ from/g;
const trelloCardIdPattern = core.getInput('trello-card-id-pattern', { required: false }) || '#';
const trelloApiKey = core.getInput('trello-api-key', { required: true });
const trelloAuthToken = core.getInput('trello-auth-token', { required: true });
const trelloBoardId = core.getInput('trello-board-id', { required: true });
const trelloCardAction = core.getInput('trello-card-action', { required: true });

function getCardNumbers(message) {
  console.log(`getCardNumber(${message})`);
  console.log(`Trello ID match pattern ${trelloCardIdPattern}`)
  let ids = message && message.length > 0 ? message.replace(regexPullRequest, "").match(new RegExp(`${trelloCardIdPattern}\\d+`, 'g')) : [];
  return ids && ids.length > 0 ? ids.map(x => x.replace(trelloCardIdPattern, '')) : [];
}

function getAllCardNumbers(message, branch) {
  const cardBranch = getCardNumbers(message);
  const cardMessage = getCardNumbers(branch);
  if (!cardBranch || !cardMessage) {
    throw new Error("PR title or branch name does not meet the guidelines");
  }
  return new Set([...cardBranch, ...cardMessage]);
}

async function getCardOnBoard(board, card) {
  console.log(`getCardOnBoard(${board}, ${card})`);
  if (card && card.length > 0) {
    let url = `https://trello.com/1/boards/${board}/cards/${card}`;
    console.log("Url is ", url);
    return await axios.get(url, { 
      params: { 
        key: trelloApiKey, 
        token: trelloAuthToken 
      }
    }).then(response => {
      return response.data.id;
    }).catch(error => {
      console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
      return null;
    });
  }

  return null;
}

async function getListOnBoard(board, list) {
  console.log(`getListOnBoard(${board}, ${list})`);
  let url = `https://trello.com/1/boards/${board}/lists`
  return await axios.get(url, { 
    params: { 
      key: trelloApiKey, 
      token: trelloAuthToken 
    }
  }).then(response => {
    let result = response.data.find(l => l.closed == false && l.name == list);
    return result ? result.id : null;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function addAttachmentToCard(card, link) {
  console.log(`addAttachmentToCard(${card}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/attachments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    url: link
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function addCommentToCard(card, user, message, link) {
  console.log(`addCommentToCard(${card}, ${user}, ${message}, ${link})`);
  let url = `https://api.trello.com/1/cards/${card}/actions/comments`;
  return await axios.post(url, {
    key: trelloApiKey,
    token: trelloAuthToken, 
    text: `${user}: ${message} ${link}`
  }).then(response => {
    return response.status == 200;
  }).catch(error => {
    console.error(url, `Error ${error.response.status} ${error.response.statusText}`);
    return null;
  });
}

async function handleHeadCommit(data) {
  console.log("handleHeadCommit", data);
  const url = data.url;
  const message = data.message;
  const user = data.author.name;
  try {
    const cardsNumbers = getCardNumbers(message);
    cardsNumbers.forEach(async cardNumber => {
      const card = await getCardOnBoard(trelloBoardId, cardNumber);
      if (card && card.length > 0) {
        if (trelloCardAction && trelloCardAction.toLowerCase() == 'attachment') {
          await addAttachmentToCard(card, url);
        }
        else if (trelloCardAction && trelloCardAction.toLowerCase() == 'comment') {
          await addCommentToCard(card, user, message, url);
        }
      }
    });
  } catch (error) {
    console.error(
      typeof error === 'string'
        ? error
        : typeof error === 'object' 
          ? error.message
          : 'Unknown error'
    );
  }
}

async function handlePullRequest(data) {
  console.log("handlePullRequest", data);
  const url = data.html_url || data.url;
  const message = data.title;
  const user = data.user.name;
  const branch = data.head.ref;
  try {
    const cardsNumbers = getAllCardNumbers(message, branch);
    if (!cardsNumbers.size) {
      console.log('No card numbers found');
      return;
    }
    cardsNumbers.forEach(async cardNumber => {
      const card = await getCardOnBoard(trelloBoardId, cardNumber);
      if (card && card.length > 0) {
        if (trelloCardAction && trelloCardAction.toLowerCase() == 'attachment') {
          await addAttachmentToCard(card, url);
        }
        else if (trelloCardAction && trelloCardAction.toLowerCase() == 'comment') {
          await addCommentToCard(card, user, message, url);
        }
      }
    });
  } catch (error) {
    console.error(
      typeof error === 'string'
        ? error
        : typeof error === 'object' 
          ? error.message
          : 'Unknown error'
    );
  }
}

async function run() {
  if (head_commit && head_commit.message) {
    handleHeadCommit(head_commit)
  }
  else if (pull_request && pull_request.title) {
    handlePullRequest(pull_request)
  }
};

run()