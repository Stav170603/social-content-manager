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
