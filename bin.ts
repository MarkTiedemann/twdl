#!/usr/bin/env node

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as child_process from 'child_process'

import * as ora from 'ora'
import * as spinners from 'cli-spinners'
import * as puppeteer from 'puppeteer'

main()

async function main(): Promise<any> {
  let spinner = ora({ color: 'cyan', spinner: spinners.dots })
  spinner.start('Parsing arguments')

  // TODO: Add `--out <file>`, `--desktop`, `--downloads`, and `--timeout` option

  let url = process.argv.pop()
  if (url === undefined) {
    return spinner.fail('Missing Tweet URL')
  }

  let tweetId = url.split('/').pop()
  if (tweetId === undefined) {
    return spinner.fail('Missing Tweet ID')
  }

  let browser: puppeteer.Browser
  try {
    spinner.text = 'Launching browser'
    browser = await puppeteer.launch()
  } catch {
    return spinner.fail('Failed to launch browser')
  }

  let page: puppeteer.Page
  try {
    spinner.text = 'Creating new page'
    page = await browser.newPage()
  } catch {
    return spinner.fail('Failed to create new page')
  }

  try {
    spinner.text = 'Opening Twitter'
    await page.goto(url)
  } catch {
    return spinner.fail('Failed to open Twitter')
  }

  let videoUrl: string
  try {
    spinner.text = 'Finding video URL'
    videoUrl = await findPlaybackUrl(page, tweetId)
  } catch {
    return spinner.fail('Failed to find video URL')
  }

  await browser.close()

  let fileName = path.join(os.homedir(), 'Desktop', `${tweetId}.mp4`)

  try {
    spinner.text = 'Downloading video file'
    await downloadFile(videoUrl, fileName)
    return spinner.succeed(fileName)
  } catch (err) {
    spinner.text = 'Cleaning up video file'
    await cleanUpFile(fileName)
    return spinner.fail('Failed to download video file')
  }
}

function findPlaybackUrl(page: puppeteer.Page, tweetId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let timeout = setTimeout(reject, 30000)
    page.on('response', async res => {
      if (isVideoConfigRequest(res, tweetId)) {
        let json = (await res.json()) as { track: { playbackUrl: string } }
        clearTimeout(timeout)
        resolve(json.track.playbackUrl)
      }
    })
  })
}

function isVideoConfigRequest(res: puppeteer.Response, tweetId: string): boolean {
  let method = res.request().method()
  let url = res.url()
  let status = res.status()
  return (
    method === 'GET' &&
    status === 200 &&
    url === `https://api.twitter.com/1.1/videos/tweet/config/${tweetId}.json`
  )
}

function downloadFile(videoUrl: string, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // TODO: Check ffmpeg options
    child_process
      .execFile('ffmpeg', ['-i', videoUrl, fileName])
      .on('error', reject)
      .on('close', code => {
        if (code === 0) resolve()
        else reject()
      })
  })
}

function cleanUpFile(fileName: string): Promise<void> {
  return new Promise(resolve => {
    fs.unlink(fileName, _ => resolve())
  })
}
