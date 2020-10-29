"use strict"

var marked = require('marked')
  , highlight = require('highlight.js')
  , fs = require('fs')
  , path = require('path')
  , util = require('util')
  , datauri = require('datauri').sync
  , helpers = require('./helpers')
  , he = require('he')


class Markdown {

  constructor(wikiPath, aliases) {
    this.wikiPath = wikiPath
    this.wikiFileAliases = aliases
    this.tocItems = []
    this.firstTocLiClassProcessed = false
    this.setupMainRenderer()
      .setupTocRenderer()
  }

  setupMainRenderer() {

    var self = this
    this.mainRenderer = new marked.Renderer()

    this.mainRenderer.code = function(code, lang) {
      if (lang && highlight.getLanguage(lang)) {
        code = highlight.highlight(lang, code, true);
      } else {
        code = highlight.highlightAuto(code);
      }
      return `<pre class="hljs">${code.value}</pre>`
    }

    this.mainRenderer.link = function(href, title, text) {
      if (!href.match(/^https?:\/\//) || self.isTocLink(href)) {
        href = '#' + helpers.getPageIdFromFilenameOrLink(href).toLowerCase()
      }
      return `<a href="${href}">${text}</a>`
    }

    this.mainRenderer.image = function(href, title, text) {
      if (!href.match(/^https?:\/\//)) {
        href = path.resolve(self.wikiPath, href)
        return util.format('<img src="%s" />', datauri(href))
      } else {
        return util.format('<img src="%s" />', href)
      }
    }
    return this
  }

  setupTocRenderer() {

    var self = this
    this.tocRenderer = new marked.Renderer()

    this.tocRenderer.list = function(body, ordered) {
      var tag = ordered ? 'ol' : 'ul'
      return `<${tag} class="nav">${body}</${tag}>`
    }

    this.tocRenderer.listitem = function(text) {
      self.tocLiCounter += 1
      var regs = text.match(/^([^<]+)/)
      if (regs) {
        text = '<span>' + text.substr(0, regs[0].length) + '</span>' + text
          .substr(regs[0].length)
      }

      if (!self.firstTocLiClassProcessed && text.substr(0, 2) === '<a') {
        self.firstTocLiClassProcessed = true
        return `<li class="active">${text}</li>`
      }

      return `<li>${text}</li>`
    }

    this.tocRenderer.link = function(href, title, text) {
      let pageId = helpers.getPageIdFromFilenameOrLink(href).toLowerCase()
      let pageIdDecoded = helpers.getPageIdFromFilenameOrLink(he.decode(href)).toLowerCase()
      if(self.wikiFileAliases[pageId]){
        self.tocItems.push({
          title: text,
          link: href,
          pageId: pageId
        })
        href = `#${pageId}`
      }
      else if (self.wikiFileAliases[pageIdDecoded]) {
          self.tocItems.push({
            title: text,
            link: href,
            pageId: pageIdDecoded
          });
          href = '#' + pageIdDecoded;
      }
      else {
          console.log('Did not find ' + href + ' with pageid ' + pageId + ' or decoded pageid ' + pageIdDecoded);
      }

      return `<a href="${href}">${text}</a>`
    }

    return this
  }

  convertTocMarkdownString(markdown) {
    return {
      tocHtml: this.convertMarkdownString(markdown, this.tocRenderer),
      tocItems: this.tocItems
    }
  }

  convertMarkdownString(markdown, renderer) {
    renderer = renderer || this.mainRenderer
    return marked(this.replaceGithubWikiLinks(markdown), {
      renderer: renderer
    })
  }

  convertMarkdownFile(markdown_file) {
    return this.convertMarkdownString(fs.readFileSync(this.getActualFilename(markdown_file), {
      encoding: 'utf8'
    }))
  }

  /**
   * @private
   * @returns {Boolean}
   */
  isTocLink(link) {
    for (let item of this.tocItems) {
      if (item.link == link) {
        return true
      }
    }
    return false
  }

  /**
   * @private
   * @returns {String}
   */
  replaceGithubWikiLinks(markdown) {
    // github supports [[...]] declaration of links. find all of them
    return markdown.replace(/\[\[([^\]]+)\]\]/g, function(allPattern, link) {

      // inside of brekets link can be added as:
      // - page name only [[Calls]], [[Call-Log]];
      // - link title only [[Call Log]];
      // - link title and page name [[Call Log|Call-Log]], [[Log|Call Log]].

      // search for link title
      let linkTitle = link.replace(/\|([^\|]+)/, "")

      // search for page name
      let pageName = link.replace(/([^\|]+)\|/, "")

      if(!linkTitle){
        linkTitle = link
      }

      if (!pageName){
        pageName = link
      }

      // make sure page name has correct format
      pageName = pageName.replace(/ /g, "-")

      // convert [[<link title> | <page name>]] to [<link title>](<page name>)
      link = `[${linkTitle}](${pageName})`
      return link
    })
  }

  /**
   * @private
   * @returns {String}
   */
  getActualFilename(filename) {
    const lcFilename = path.basename(filename).toLowerCase()
      // handles passing in `c:\\`
      if (!lcFilename) {
        return filename.toUpperCase().toString()
      }

      const dirname = path.dirname(filename)
      let filenames;
      try {
        filenames = fs.readdirSync(dirname)
      } catch (e) {
        // we already verified the path exists above so if this
        // happens it means the OS won't let use get a listing (UNC root on windows)
        // so it's the best we can do
        return filename.toString();
      }
      const matches = filenames.filter(name => lcFilename === name.toLowerCase())
      if (!matches.length) {
        throw new Error(`${filename} does not exist`);
      }

      const realname = matches[0];
      if (dirname !== '.') {
        if (dirname.endsWith('/') || dirname.endsWith('\\')) {
          return path.join(dirname, realname).toString()
        } else {
          return path.join(getActualFilename(dirname), realname).toString()
        }
      } else {
        return realname.toString()
    } 
  }
}


module.exports = Markdown
