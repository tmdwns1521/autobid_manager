import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { Device } from '@autobid/shared'

export interface ScrapeRankResult {
  rank: number | null
  found: boolean
  totalAds: number
  error?: string
}

export interface ScrapeRankBothResult {
  pc: ScrapeRankResult
  mobile: ScrapeRankResult
}

@Injectable()
export class NaverSearchScraperService {
  private readonly logger = new Logger(NaverSearchScraperService.name)

  async scrapeRankBoth(keyword: string, siteUrl: string): Promise<ScrapeRankBothResult> {
    const [pc, mobile] = await Promise.all([
      this.scrapeRank(keyword, siteUrl, Device.PC),
      this.scrapeRank(keyword, siteUrl, Device.MOBILE),
    ])
    return { pc, mobile }
  }

  async scrapeRank(keyword: string, siteUrl: string, device: Device = Device.PC): Promise<ScrapeRankResult> {
    const encoded = encodeURIComponent(keyword)

    // 광고 전용 페이지 (SSR, axios로 직접 파싱 가능)
    const searchUrl =
      device === Device.MOBILE
        ? `https://m.ad.search.naver.com/search.naver?where=m_expd&query=${encoded}`
        : `https://ad.search.naver.com/search.naver?where=ad&query=${encoded}`

    // siteUrl은 콤마로 구분된 복수 도메인일 수 있음
    const domains = siteUrl
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
      .filter(Boolean)

    try {
      const { data: html } = await axios.get<string>(searchUrl, {
        headers: {
          'User-Agent':
            device === Device.MOBILE
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
              : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: device === Device.MOBILE
            ? 'https://m.ad.search.naver.com/'
            : 'https://ad.search.naver.com/',
        },
        timeout: 12000,
      })

      const $ = cheerio.load(html)
      let foundRank: number | null = null
      let totalAds = 0

      if (device === Device.MOBILE) {
        // 모바일: m.ad.search.naver.com — 각 광고는 .lst_cont
        // URL은 .tit_wrap 텍스트에서 도메인 패턴으로 추출
        // rank는 nclk onclick의 마지막 숫자 파라미터
        const domainRegex = /([a-zA-Z0-9가-힣][a-zA-Z0-9가-힣._\-]*\.(?:co\.kr|com|kr|net|org)[^\s]*)/

        $('.lst_cont').each((index, el) => {
          totalAds++
          if (foundRank !== null) return

          const nclkOnclick = $(el).find('a[onclick*="nclk"]').first().attr('onclick') ?? ''
          const rankMatch = nclkOnclick.match(/nclk\(this,\s*'[^']+',\s*'[^']+',\s*(\d+)\)/)
          const rank = rankMatch ? parseInt(rankMatch[1]) : index + 1

          const titText = $(el).find('.tit_wrap').text().toLowerCase()
          const urlMatch = titText.match(domainRegex)
          if (urlMatch) {
            const destDomain = urlMatch[1].replace(/\/$/, '')
            const matched = domains.some(d => destDomain.includes(d) || d.includes(destDomain.split('/')[0]))
            if (matched) foundRank = rank
          }
        })
      } else {
        // PC: ad.search.naver.com — 각 광고는 li.lst[data-promotion]
        // URL은 a[onclick*="urlencode"] 또는 a[onclick*="encodeURIComponent"]에서 추출
        const urlRegex = /(?:encodeURIComponent|urlencode)\("([^"]+)"\)/

        $('li.lst[data-promotion]').each((index, el) => {
          totalAds++
          if (foundRank !== null) return

          const aWithEncode = $(el).find('a[onclick*="urlencode"], a[onclick*="encodeURIComponent"]').first()
          const onclick = aWithEncode.attr('onclick') ?? ''
          const urlMatch = onclick.match(urlRegex)
          const rMatch = onclick.match(/[,&"']r=(\d+)[,&"']/)
          const rank = rMatch ? parseInt(rMatch[1]) : index + 1

          if (urlMatch) {
            const destUrl = urlMatch[1].toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
            const matched = domains.some(d => destUrl.includes(d) || d.includes(destUrl.split('/')[0]))
            if (matched) foundRank = rank
          }
        })
      }

      this.logger.debug(`[${keyword}/${device}] 파워링크 ${totalAds}개 중 내 광고: ${foundRank ?? '미노출'} 위`)
      return { rank: foundRank, found: foundRank !== null, totalAds }
    } catch (err: any) {
      this.logger.error(`[${keyword}/${device}] 스크래핑 실패: ${err.message}`)
      return { rank: null, found: false, totalAds: 0, error: err.message }
    }
  }
}
