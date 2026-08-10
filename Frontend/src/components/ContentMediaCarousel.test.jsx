import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ContentMediaCarousel from './ContentMediaCarousel.jsx'

describe('ContentMediaCarousel',()=>{
 afterEach(cleanup)
 it('navigates ordered mixed media with accessible controls',()=>{
  render(<ContentMediaCarousel alt="Post" media={[{mediaUrl:'https://cdn.example/one.jpg',mediaType:'IMAGE'},{mediaUrl:'https://cdn.example/two.mp4',mediaType:'VIDEO'}]}/>)
  expect(screen.getByAltText('Post, פריט 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'המדיה הבאה'}))
  expect(document.querySelector('video')?.getAttribute('src')).toContain('two.mp4')
  expect(screen.getByText('2 / 2')).toBeTruthy()
 })
 it('opens the exact selected carousel video with its own poster',()=>{
  render(<ContentMediaCarousel alt="Client post" media={[
   {mediaId:1,mediaUrl:'https://cdn.example/first.jpg',mediaType:'IMAGE'},
   {mediaId:2,mediaUrl:'https://cdn.example/exact-video.mp4',mediaType:'VIDEO',thumbnailUrl:'https://cdn.example/exact-cover.jpg'},
  ]}/>)
  fireEvent.click(screen.getByRole('button',{name:'המדיה הבאה'}))
  const video=document.querySelector('video')
  expect(video?.getAttribute('src')).toContain('exact-video.mp4')
  expect(video?.getAttribute('poster')).toContain('exact-cover.jpg')
 })
 it('preserves legacy single media without controls',()=>{
  render(<ContentMediaCarousel fallbackUrl="https://cdn.example/legacy.jpg" fallbackType="IMAGE" alt="Legacy"/>)
  expect(screen.getByAltText('Legacy, פריט 1').getAttribute('loading')).toBe('lazy')
  expect(screen.queryByRole('button',{name:'המדיה הבאה'})).toBeNull()
 })
})

it('uses a saved video cover as the playback poster',()=>{
  render(<ContentMediaCarousel media={[{mediaUrl:'https://cdn.example/video.mp4',mediaType:'VIDEO',thumbnailUrl:'https://cdn.example/cover.jpg'}]} />)
  expect(document.querySelector('video')?.getAttribute('poster')).toContain('cover.jpg')
})

it('keeps a distinct generated poster for each Cloudinary carousel video',()=>{
  cleanup()
  render(<ContentMediaCarousel media={[
    {mediaId:11,mediaUrl:'https://res.cloudinary.com/demo/video/upload/first.mp4',mediaType:'VIDEO'},
    {mediaId:12,mediaUrl:'https://res.cloudinary.com/demo/video/upload/second.mp4',mediaType:'VIDEO'},
  ]} />)
  expect(document.querySelector('video')?.getAttribute('poster')).toContain('/first.jpg')
  fireEvent.click(screen.getByRole('button',{name:/הבאה/}))
  expect(document.querySelector('video')?.getAttribute('poster')).toContain('/second.jpg')
})
