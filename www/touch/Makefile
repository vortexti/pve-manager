include ../../defines.mk

TOUCHDIR=touch-2.4.2
TOUCHSRC=sencha-touch-2.4.2-gpl.zip

TOUCHDATA = 					\
	${TOUCHDIR}/sencha-touch-all.js		\
	${TOUCHDIR}/sencha-touch-all-debug.js


${TOUCHDATA}: extract_touch

.PHONY: extract_touch
extract_touch: ${TOUCHSRC}
	rm -rf ${TOUCHDIR}
	unzip -q -x ${TOUCHSRC}

.PHONY: all
all:

.PHONY: install
install: ${TOUCHDATA} index.html.tpl
	install -d ${WWWTOUCHDIR}
	install -m 0644 ${TOUCHDATA} ${WWWTOUCHDIR}
	install -d ${WWWTOUCHDIR}/resources/css
	cp ${TOUCHDIR}/resources/css/*.css ${WWWTOUCHDIR}/resources/css
	install -m 0644 pve.css ${WWWTOUCHDIR}/resources/css
	install -m 0644 index.html.tpl ${WWWTOUCHDIR}
	install -d ${WWWTOUCHDIR}/resources/themes/images
	cp -a ${TOUCHDIR}/resources/themes/images/default ${WWWTOUCHDIR}/resources/themes/images
	find ${WWWTOUCHDIR} -type f -exec chmod -R 0644 '{}' ';'

.PHONY: clean
clean:
	rm -rf *~ ${TOUCHDIR}

